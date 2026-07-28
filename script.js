// ---------------------------------------------------------------------------
// Urbanos de Marbella - main script
// ---------------------------------------------------------------------------

// Global state object to track the modal status and bus line
var modalState = {
    isOpen: false,
    busLine: null,
    busRef: null,
    updateBusLocation: null
};

// ---------------------------------------------------------------------------
// API configuration
//
// The service exposes the same data through two namespaces: `lineas` (static /
// schedule backend) and `gmv` (the real-time backend). Since the API fails more
// often than it succeeds, arrivals are requested from each source in turn until
// one answers - see fetchBusData(). Every response is wrapped in
// {status, code, message, data}.
// ---------------------------------------------------------------------------

var API_BASE = 'https://apisvt.avanzagrupo.com';
var API_EMPRESA = '0-9999';    // operator selector used for arrivals lookups
var API_TIMEOUT = 15000;       // total budget for one refresh cycle
var LEG_TIMEOUT = 5000;        // per-endpoint timeout; 3 legs = the budget above

// Arrival sources, tried in order. All three accept empresa/parada/find and
// answer with data.traficos[]; only some also return data.parada.
var ARRIVAL_ENDPOINTS = [
    API_BASE + '/lineas/getTraficosParada',
    API_BASE + '/gmv/getTraficosParada',
    API_BASE + '/gmv/getStop'
];

var STOPS_URL = API_BASE + '/lineas/getParadas';
var LINES_URL = API_BASE + '/lineas/getLineas?empresa=10-21';

// Static data (stop list, line colors) barely changes, so it is cached to cut
// down on calls to an unreliable API. A stale cache is still served when the
// network fails - outdated colors beat no results at all.
var CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

var userZoomLevel = 18; // Default zoom level

// Request bookkeeping. The API is slow and fails often, so a response from a
// previously requested stop can arrive after the user has already switched to
// another stop. Every request gets a token; a response whose token no longer
// matches the latest one is discarded, and the in-flight request is aborted
// whenever a new one starts.
var activeStopRequest = null;  // jqXHR in flight for getTraficosParada
var stopRequestToken = 0;      // increments with every stop query
var loadedStopId = null;       // stop whose data is currently rendered

var searchToken = 0;           // same idea for name/nearby stop searches
var activeMap = null;          // Leaflet instance living in the map modal

var AUTO_REFRESH_MS = 5000;    // delay between a response arriving and the next refresh
var autoRefreshTimerId = null;

var loadingAnimationId;

// ---------------------------------------------------------------------------
// localStorage cache for static data
// ---------------------------------------------------------------------------

// Read a cached entry. Returns {value, stale} or null when nothing is stored.
// Callers use fresh entries directly and keep stale ones as a fallback for when
// the request fails.
function cacheRead(key) {
    try {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        var entry = JSON.parse(raw);
        if (!entry || typeof entry.t !== 'number') return null;
        return { value: entry.v, stale: (Date.now() - entry.t) > CACHE_TTL_MS };
    } catch (e) {
        // Private browsing, disabled storage or corrupted entry
        return null;
    }
}

function cacheWrite(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) {
        // Over quota or storage unavailable - caching is best effort
    }
}

// Load a cached JSON endpoint. A fresh cache answers without touching the
// network; otherwise the request runs and, if it fails, a stale cache is used
// as a fallback before giving up. `onData` receives the response payload.
function loadCached(cacheKey, url, onData, onError) {
    var cached = cacheRead(cacheKey);

    if (cached && !cached.stale) {
        onData(cached.value);
        return;
    }

    $.ajax({
        url: url,
        type: 'GET',
        dataType: 'json',
        timeout: API_TIMEOUT,
        success: function (response) {
            if (response && response.status === 'ok' && response.data) {
                cacheWrite(cacheKey, response);
                onData(response);
            } else if (cached) {
                onData(cached.value); // serve stale rather than nothing
            } else if (onError) {
                onError(responseError(response));
            }
        },
        error: function (xhr, status) {
            if (cached) {
                onData(cached.value); // serve stale rather than nothing
            } else if (onError) {
                onError(status === 'timeout' ? 'Timeout' : 'Could not fetch data');
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Response envelope helpers
// ---------------------------------------------------------------------------

// The API answers with {status, code, message, data}. A missing-data reply is
// not necessarily a failure: the real-time endpoints report "no buses due" as a
// data-level 404, which is a normal state at night or on infrequent lines.
function isNoDataResponse(response) {
    if (!response) return false;
    var code = String(response.code || '');
    var status = String(response.status || '');
    return code.indexOf('404') !== -1 || status.indexOf('404') !== -1;
}

// Human-readable reason from the envelope, preferring the server's own message
function responseError(response) {
    if (!response) return 'No response from server';
    if (response.message) return String(response.message);
    if (response.code) return 'Error ' + response.code;
    return 'Invalid or missing data';
}

// Normalize the differing payload shapes into {parada, traficos}.
// /lineas/getTraficosParada and /gmv/getStop return a parada object;
// /gmv/getTraficosParada may omit it, in which case the caller falls back to
// the stop id that was requested.
function normalizeArrivals(data) {
    if (!data) return null;
    var traficos = data.traficos || data.trafico || [];
    if (!$.isArray(traficos)) traficos = [traficos];
    var parada = data.parada || (($.isArray(data.paradas) && data.paradas.length) ? data.paradas[0] : null);
    return { parada: parada, traficos: traficos };
}

function showLoadingText() {
    const loadingText = $('#loadingText');
    loadingText.text('Querying database...');
    loadingAnimationId = loadingText.fadeIn();  // Save the animation id
}

function hideLoadingText() {
    if (loadingAnimationId) {
        $('#loadingText').fadeOut();
    }
}

// Show loading overlay
function showLoadingOverlay() {
    $('body').addClass('loading');  // Blur the background
    $('#loadingOverlay').show();    // Show the overlay
}

// Hide loading overlay
function hideLoadingOverlay() {
    $('body').removeClass('loading'); // Remove blur from background
    $('#loadingOverlay').hide();      // Hide the overlay
}

// Show loading animation for the map modal
function showMapLoadingAnimation() {
    $('#mapLoadingOverlay').show();
}

// Hide loading animation for the map modal
function hideMapLoadingAnimation() {
    $('#mapLoadingOverlay').hide();
}

// Update the status line, swapping the state class so colors follow the theme
function setUpdateStatus(message, stateClass) {
    $('#updateStatus')
        .text(message)
        .removeClass('status-ok status-err status-neutral')
        .addClass(stateClass);
}

// Function to show the custom dialog
function showCustomDialog(message) {
    var dialog = document.getElementById("customDialog");
    var dialogMessage = document.getElementById("dialogMessage");
    var span = document.getElementsByClassName("close-dialog")[0];

    // Check if dialogMessage exists before trying to update it
    if (!dialog || !dialogMessage) {
        console.error('Error: dialogMessage element is not found in the DOM.');
        return;  // Exit the function to prevent further errors
    }

    dialogMessage.textContent = message;
    dialog.style.display = "block";

    span.onclick = function() {
        dialog.style.display = "none";
    };

    // Close when clicking the backdrop. Bound on the dialog itself instead of
    // window so it cannot clobber the map modal's close handler.
    dialog.onclick = function(event) {
        if (event.target === dialog) {
            dialog.style.display = "none";
        }
    };
}

// Function to search nearby stops based on current GPS location
function searchNearbyStops() {
    // Show loading text
    showLoadingText();

    // Check if Geolocation is supported by the browser
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            function (position) {
                // Get user's current coordinates
                var userCoordinates = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };

                var token = ++searchToken;

                // Stop list (cached - it is the same payload for every search)
                loadCached('cache:paradas', STOPS_URL,
                    function (response) {
                        if (token !== searchToken) return; // superseded search

                        // Calculate distances and find the nearest 6 stops
                        var nearbyStops = findNearestStops(response.data.paradas, userCoordinates, 6);

                        // Display nearby stops
                        displayMatchingStops(nearbyStops, token);

                        // Hide loading text when the search is complete
                        hideLoadingText();
                    },
                    function () {
                        if (token !== searchToken) return;

                        // Display error message
                        showCustomDialog('Error fetching bus stop data. Please try again later.');

                        // Hide loading text when there's an error
                        hideLoadingText();
                    });
            },
            function (error) {
                // Handle Geolocation error
                showCustomDialog('Error getting your current location. Please try again or use manual search.');

                // Hide loading text when there's an error
                hideLoadingText();
            }
        );
    } else {
        // Geolocation is not supported
        showCustomDialog('Geolocation is not supported by your browser. Please use manual search.');

        // Hide loading text when there's an error
        hideLoadingText();
    }
}

// Function to find the nearest stops based on user's location
function findNearestStops(stops, userCoordinates, count) {
    // Calculate distances using Haversine formula
    stops.forEach(function (stop) {
        var stopCoordinates = {
            latitude: parseFloat(stop.coordinates[0]),
            longitude: parseFloat(stop.coordinates[1])
        };

        stop.distance = haversineDistance(userCoordinates, stopCoordinates);
    });

    // Sort stops by distance
    stops.sort(function (a, b) {
        return a.distance - b.distance;
    });

    // Return the specified number of nearest stops
    return stops.slice(0, count);
}

// Function to calculate the distance between two coordinates using Haversine formula
function haversineDistance(coord1, coord2) {
    function toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    var R = 6371; // Radius of the Earth in kilometers
    var dLat = toRadians(coord2.latitude - coord1.latitude);
    var dLon = toRadians(coord2.longitude - coord1.longitude);

    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(coord1.latitude)) * Math.cos(toRadians(coord2.latitude)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var distance = R * c * 1000; // Convert distance to meters

    return distance;
}

// Function to convert degrees to radians
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function searchBusStop() {
    // Show loading text
    showLoadingText();

    // Get the stop name entered by the user
    var stopName = $('#stopNameInput').val().trim();

    // Fetch bus stops data only if a name is provided
    if (stopName) {
        var token = ++searchToken;

        // Stop list (cached - it is the same payload for every search)
        loadCached('cache:paradas', STOPS_URL,
            function(response) {
                if (token !== searchToken) return; // superseded search

                // Filter stops based on the entered name
                var matchingStops = response.data.paradas.filter(function(stop) {
                    // Split the stop name into lowercase words
                    var stopWords = stop.ds.toLowerCase().split(/\s+/);

                    // Split the search term into lowercase words
                    var searchWords = stopName.toLowerCase().split(/\s+/);

                    // Check if every search word is present in at least one stop word
                    return searchWords.every(function(word) {
                        // Check if the stop name includes the current search word
                        return stopWords.some(function(stopWord) {
                            return stopWord.includes(word);
                        });
                    });
                });

                // Initialize distance property for each stop to avoid undefined error
                matchingStops.forEach(function(stop) {
                    stop.distance = 0;
                });

                // Display matching stops
                displayMatchingStops(matchingStops, token);

                // Hide loading text when the search is complete
                hideLoadingText();
            },
            function() {
                if (token !== searchToken) return;

                // Display error message
                showCustomDialog('Error fetching bus stop data. Please try again later.');

                // Hide loading text when there's an error
                hideLoadingText();
            });
    } else {
        // Display message if no name is provided
        showCustomDialog('Please enter a Stop Name for search.');

        // Hide loading text when the search is complete (even in case of an error)
        hideLoadingText();
    }
}

// Function to display matching/nearby stops
function displayMatchingStops(stops, token) {
    // Clear previous data and ensure there is no loading text
    hideLoadingText();
    $('#stopInfo').empty();

    // Bus line colors (cached - they effectively never change)
    loadCached('cache:lineas', LINES_URL,
        function (colorResponse) {
            if (token !== undefined && token !== searchToken) return; // superseded search

            // Create a map to store color information based on line id
            const colorMap = {};
            colorResponse.data.forEach(function (line) {
                colorMap[line.id] = line.color;
            });

            renderStopList(stops, colorMap);
        },
        function () {
            if (token !== undefined && token !== searchToken) return;

            // Color data is cosmetic: still show the stops, defaulting to red
            renderStopList(stops, {});
        });
}

// Render the list of stop cards with their line symbols
function renderStopList(stops, colorMap) {
    $('#stopInfo').empty();

    stops.forEach(function (stop) {
        var stopInfo = $('<div>');

        // Table for Stop ID, Name, and Location link
        var table = $('<table>').addClass('stopInfoTable');

        // Create a new row for the clickable header
        var clickableHeaderRow = $('<tr>');
        var headerLink = $('<a>').attr('href', '#')
            .click(function (event) {
                event.preventDefault();
                // Auto-fill the custom Stop ID field and update the page
                $('#stopIdInput').val(stop.cod);
                fetchBusData();
            });

        // Create an image element and set its attributes
        var extLinkImg = $('<img>').attr({
            src: './img/extlink.png',
            alt: 'External Link',
            width: '13',
            height: '13'
        });

        // Append the image and text to the link
        headerLink.append(extLinkImg).append(' Stop ID: ' + stop.cod + ' - ' + stop.ds);

        // Add "Add to Favorites" button
        var addToFavoritesButton = $('<button>').text('Add to Favorites ★').click(function () {
            addToFavorites(stop.cod, stop.ds);
        });

        // Add "View Next Buses" button
        var viewNextBusesButton = $('<button>').html('View Next Buses <img src="./img/bus.png" alt="Bus Icon" width="12" height="12">').click(function () {
            $('#stopIdInput').val(stop.cod);
            fetchBusData();
        });

        clickableHeaderRow.append($('<th>').append(headerLink).append($('<div>').addClass('stopActions').append(addToFavoritesButton).append(viewNextBusesButton)));

        var locationLinkRow = $('<tr>').append($('<td>').append($('<a>')
            .attr('href', 'https://www.google.com/maps?q=' + stop.coordinates[0] + ',' + stop.coordinates[1])
            .addClass('stopCoordinates')
            .text('View on Map')));

        // Create a new row for line symbols
        var linesRow = $('<tr>');
        var linesCell = $('<td>');

        // Display line symbols with dynamically updated colors
        stop.lines.forEach(function (line) {
            var lineColor = colorMap[line] || '#FF0000'; // Default to red if color not found
            var lineSymbol = $('<div>').addClass('lineSymbol').text(line).css('background-color', lineColor);
            linesCell.append(lineSymbol);
        });
        linesRow.append(linesCell);

        table.append(clickableHeaderRow, locationLinkRow, linesRow);
        stopInfo.append(table);

        $('#stopInfo').append(stopInfo);
    });
}


// Function to add a bus stop to favorites
function addToFavorites(stopId, defaultStopName) {
    // Create a custom dialog for adding favorites
    var favoriteName = promptDialog('Enter a name for this favorite stop:', defaultStopName);

    if (favoriteName !== null) {
        // Store the favorite in a persistent browser cookie
        var favorites = JSON.parse(getCookie('favorites')) || [];
        favorites.push({ stopId: stopId, favoriteName: favoriteName });
        setCookie('favorites', JSON.stringify(favorites), 365);

    }
}

// Function to prompt the user with a custom dialog
function promptDialog(message, defaultValue) {
    var userInput = prompt(message, defaultValue);
    return userInput;
}

// Function to get a cookie value by name
function getCookie(name) {
    var match = document.cookie.match(new RegExp(name + '=([^;]+)'));
    return match ? match[1] : null;
}

// Function to set a cookie value
function setCookie(name, value, days) {
    var expires = '';
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = '; expires=' + date.toUTCString();
    }
    document.cookie = name + '=' + value + expires + '; path=/';
}

function showFavorites() {
    // Close any existing favorites dialog
    $('.favoritesDialog').remove();

    // Get favorites from the cookie
    var favorites = JSON.parse(getCookie('favorites')) || [];

    // Create a custom dialog for displaying favorites
    var favoritesDialog = $('<div>').addClass('favoritesDialog');
    favoritesDialog.append($('<h3>').text('Favorites ★'));

    // Display each favorite stop with a clickable link and remove button
    favorites.forEach(function (favorite) {
        var favoriteStopInfo = $('<div>').addClass('favoriteStopInfo');
        var favoriteLink = $('<a>').attr('href', '#')
            .text(favorite.favoriteName)
            .click(function (event) {
                event.preventDefault();

                // Close the favorites dialog
                favoritesDialog.remove();

                // Fill the "Custom Stop ID" field and update the page
                $('#stopIdInput').val(favorite.stopId);
                fetchBusData();
            });

        var removeButton = $('<button>').text('Remove').click(function () {
            // Remove the specific favorite from the list and update the cookie
            removeFavorite(favorite.stopId);
            // Close and reopen the favorites panel
            showFavorites();
        });

        favoriteStopInfo.append($('<h4>').append(favoriteLink));
        favoriteStopInfo.append($('<p>').text('ID: ' + favorite.stopId));
        favoriteStopInfo.append(removeButton);
        favoritesDialog.append(favoriteStopInfo);
    });

    // Add a close button
    var closeButton = $('<button>').text('Close').click(function () {
        favoritesDialog.remove();
    });
    favoritesDialog.append(closeButton);

    // Append the dialog to the body
    $('body').append(favoritesDialog);
}

// Function to remove a favorite from the list
function removeFavorite(stopId) {
    var favorites = JSON.parse(getCookie('favorites')) || [];
    var updatedFavorites = favorites.filter(function (favorite) {
        return favorite.stopId !== stopId;
    });
    setCookie('favorites', JSON.stringify(updatedFavorites), 365);
}

//Function to give a correct format to the dates
function formatDate(timestamp) {
    if (!timestamp) return '';
    var text = String(timestamp);
    var year = text.substr(0, 4);
    var month = text.substr(4, 2);
    var day = text.substr(6, 2);
    return year + '-' + month + '-' + day;
}

// Format the system clock time that accompanies real-time responses. The field
// arrives either already punctuated ("14:32:05") or as bare digits ("143205"),
// so both are accepted.
function formatTime(horaSistema) {
    if (!horaSistema) return '';
    var text = String(horaSistema).trim();
    if (text.indexOf(':') !== -1) return text;
    if (/^\d{6}$/.test(text)) {
        return text.substr(0, 2) + ':' + text.substr(2, 2) + ':' + text.substr(4, 2);
    }
    if (/^\d{4}$/.test(text)) {
        return text.substr(0, 2) + ':' + text.substr(2, 2);
    }
    return text;
}

function fetchBusData() {
    var customStopId = $('#stopIdInput').val().trim();
    if (!customStopId) {
        showCustomDialog('Please enter a Stop ID.');
        return;
    }

    // A response for an older request must never be rendered: abort whatever
    // is still in flight and invalidate its callbacks via the token.
    if (activeStopRequest) {
        activeStopRequest.abort();
        activeStopRequest = null;
    }
    var token = ++stopRequestToken;

    // The next auto-refresh is armed only once this request has answered, so
    // a pending timer must not fire while the request is in flight.
    clearTimeout(autoRefreshTimerId);

    // Switching to a different stop: drop the previous stop's rows right away
    // so they can never be mistaken for the new stop while the request is
    // pending (or after it fails).
    if (customStopId !== loadedStopId) {
        loadedStopId = null;
        $('#busTable tbody').empty();
        $('#stopInfoHeader').text('Stop ID: ' + customStopId);
        $('#timestamp').text('');
        setUpdateStatus('Loading stop ' + customStopId + '...', 'status-neutral');
    }

    requestArrivals(customStopId, token, 0);
}

// One leg of the arrival failover chain. A transport failure or an unusable
// payload advances to the next endpoint; a usable answer - including a genuine
// "no buses due" - ends the chain. The whole chain shares a single token, so
// switching stops still cancels everything that is pending.
function requestArrivals(stopId, token, index) {
    if (token !== stopRequestToken) return; // superseded while advancing

    // Every source refused: report the last reason and let the loop continue.
    if (index >= ARRIVAL_ENDPOINTS.length) {
        activeStopRequest = null;
        setUpdateStatus('Error: Could not fetch data', 'status-err');
        scheduleAutoRefresh();
        return;
    }

    var isLastLeg = (index === ARRIVAL_ENDPOINTS.length - 1);

    function fallback(reason) {
        if (token !== stopRequestToken) return;
        if (isLastLeg) {
            activeStopRequest = null;
            setUpdateStatus('Error: ' + reason, 'status-err');
            scheduleAutoRefresh();
        } else {
            requestArrivals(stopId, token, index + 1);
        }
    }

    activeStopRequest = $.ajax({
        url: ARRIVAL_ENDPOINTS[index] +
            '?empresa=' + encodeURIComponent(API_EMPRESA) +
            '&parada=' + encodeURIComponent(stopId) + '&find=',
        type: 'GET',
        dataType: 'json',
        timeout: LEG_TIMEOUT, // aborts the request instead of just complaining
        success: function(response) {
            if (token !== stopRequestToken) return; // stale response, discard

            var arrivals = response ? normalizeArrivals(response.data) : null;

            // A data-level 404 means the stop is fine but nothing is due; an
            // "ok" reply with no departures says the same thing. Both are real
            // answers, so the chain stops here rather than retrying elsewhere.
            if (isNoDataResponse(response) ||
                (response && response.status === 'ok' && arrivals && !arrivals.traficos.length)) {
                activeStopRequest = null;
                renderNoBuses(stopId, response);
                scheduleAutoRefresh();
                return;
            }

            if (response && response.status === 'ok' && arrivals && arrivals.traficos.length) {
                activeStopRequest = null;
                renderBusData(stopId, response, arrivals);
                scheduleAutoRefresh();
                return;
            }

            // Anything else (error envelope, unexpected shape) - try the next
            // source, surfacing this one's own message if it was the last.
            fallback(responseError(response));
        },
        error: function(xhr, status) {
            if (token !== stopRequestToken) return; // stale request, discard
            if (status === 'abort') return;         // superseded on purpose

            fallback(status === 'timeout' ? 'Timeout' : 'Could not fetch data');
        }
    });
}

// Render a successful getTraficosParada response into the arrivals table
function renderBusData(stopId, response, arrivals) {
    arrivals = arrivals || normalizeArrivals(response.data);

    $('#busTable tbody').empty();
    $('#stopInfoHeader').text(stopHeaderText(stopId, arrivals.parada));

    $.each(arrivals.traficos, function(index, bus) {
        var row = $('<tr>');
        row.append($('<td>').addClass('cellLine').text(bus.coLinea));
        row.append($('<td>').addClass('cellTime').text(bus.quedan));
        row.append($('<td>').addClass('cellDest').text(bus.dsDestino));
        var mapImage = $('<img>').attr('src', './img/pushpin.png').attr('alt', 'View on Map').addClass('icon');
        var mapLink = $('<a>').attr('href', '#').addClass('busLocationLink')
            .data('lat', bus.lat)
            .data('lon', bus.lon)
            .data('busLine', bus.coLinea)
            .data('ref', bus.ref)
            .append(mapImage);
        row.append($('<td>').append(mapLink));
        $('#busTable tbody').append(row);

        if (modalState.isOpen && bus.coLinea === modalState.busLine && bus.ref === modalState.busRef) {
            modalState.updateBusLocation(bus.lat, bus.lon);
        }
    });

    loadedStopId = stopId;
    $('#timestamp').text(timestampText(response));
    setUpdateStatus('Up to date ✔', 'status-ok');
}

// The stop is reachable but nothing is due. This is a normal state (late at
// night, infrequent lines), so it is reported neutrally instead of as an error.
function renderNoBuses(stopId, response) {
    $('#busTable tbody').empty();
    var arrivals = response ? normalizeArrivals(response.data) : null;
    $('#stopInfoHeader').text(stopHeaderText(stopId, arrivals && arrivals.parada));

    loadedStopId = stopId;
    $('#timestamp').text(timestampText(response));
    setUpdateStatus('No buses due', 'status-neutral');
}

// Header text for the arrivals table. Endpoints that omit the parada object
// still get a usable header from the requested stop id.
function stopHeaderText(stopId, parada) {
    if (parada && parada.cod) {
        return 'Stop ID: ' + parada.cod + (parada.ds ? ' - ' + parada.ds : '');
    }
    return 'Stop ID: ' + stopId;
}

// "Updated 14:32:05 · 2026-07-27 · 42 ms" - the clock time matters most for
// live arrivals, so it leads; each part is dropped when the API omits it.
function timestampText(response) {
    if (!response) return '';
    var parts = [];
    var time = formatTime(response.horaSistema);
    var date = formatDate(response.fxSistema);

    if (time) parts.push('Updated ' + time);
    if (date) parts.push(date);
    if (response.time !== undefined && response.time !== null) parts.push(response.time + ' ms');

    return parts.join(' · ');
}

// Function to open the modal and display the map. The API status pre-check
// that used to live here was removed: it was an extra call to an unreliable
// endpoint that frequently blocked the modal from opening at all.
function openMapModal(busLat, busLon, busLine, busRef) {
    var modal = document.getElementById("mapModal");
    var span = modal.querySelector(".close");

    modal.style.display = "block";

    // Show map loading animation while the map is loading
    showMapLoadingAnimation();

    // Leaflet refuses to initialise twice on the same container, so tear down
    // any previous instance first.
    if (activeMap) {
        activeMap.remove();
        activeMap = null;
    }

    // Use the stored zoom level
    var map = L.map('mapContainer').setView([busLat, busLon], userZoomLevel);
    activeMap = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Define custom icon
    var busIcon = L.icon({
        iconUrl: './img/bus-icon.png',
        iconSize: [40, 40], // Size of the icon
        iconAnchor: [20, 40], // Point of the icon which corresponds to marker's location
        popupAnchor: [0, -40] // Point from which the popup should open relative to the iconAnchor
    });

    // Add custom icon marker
    var marker = L.marker([busLat, busLon], { icon: busIcon }).addTo(map);

    // Hide map loading animation once the map is ready
    map.whenReady(function() {
        hideMapLoadingAnimation();
    });

    // Listen for zoom events and update the stored zoom level
    map.on('zoomend', function() {
        userZoomLevel = map.getZoom();
    });

    modalState.isOpen = true;
    modalState.busLine = busLine;
    modalState.busRef = busRef;
    modalState.updateBusLocation = function(newLat, newLon) {
        map.setView([newLat, newLon], userZoomLevel);
        marker.setLatLng([newLat, newLon]);
    };

    function closeModal() {
        modal.style.display = "none";
        if (activeMap) {
            activeMap.remove();
            activeMap = null;
        }
        modalState.isOpen = false;
        modal.onclick = null;
    }

    span.onclick = closeModal;

    // Close when clicking the backdrop. Bound on the modal itself instead of
    // window so it cannot collide with other dialogs' handlers.
    modal.onclick = function(event) {
        if (event.target === modal) {
            closeModal();
        }
    };

    // Refresh immediately so the marker starts from the newest position
    fetchBusData();
}

// Auto-refresh the arrivals table. Instead of a fixed interval, the next
// refresh is armed only after the previous response has arrived — successful
// or not — so requests can never overlap or pile up while the API is slow.
function scheduleAutoRefresh() {
    clearTimeout(autoRefreshTimerId);
    autoRefreshTimerId = setTimeout(function() {
        var currentStopId = $('#stopIdInput').val();
        if (currentStopId && currentStopId.trim() && !activeStopRequest) {
            setUpdateStatus('Updating...', 'status-neutral');
            fetchBusData();
        } else {
            // No stop selected yet (or a manual query is mid-flight, which
            // will re-arm on its own completion): check back later.
            scheduleAutoRefresh();
        }
    }, AUTO_REFRESH_MS);
}

scheduleAutoRefresh();

$(function() {
    // Open the bus location map from the arrivals table (delegated so it
    // survives the table being re-rendered on every refresh)
    $(document).on('click', '.busLocationLink', function(event) {
        event.preventDefault();
        var link = $(this);
        openMapModal(link.data('lat'), link.data('lon'), link.data('busLine'), link.data('ref'));
    });

    // Add event listeners for Enter key press on input fields
    $('#stopNameInput').keypress(function(event) {
        if (event.which == 13) { // Enter key pressed
            searchBusStop();
        }
    });

    $('#stopIdInput').keypress(function(event) {
        if (event.which == 13) { // Enter key pressed
            fetchBusData();
        }
    });
});

// Check and apply the saved theme on page load
window.addEventListener('load', function () {
    const darkModeStylesheet = document.getElementById('darkModeStylesheet');
    const themeToggleButton = document.getElementById('themeToggle');

    // Check if the theme preference is saved in localStorage
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark' && !darkModeStylesheet) {
        // Apply dark mode if saved preference is dark
        const link = document.createElement('link');
        link.id = 'darkModeStylesheet';
        link.rel = 'stylesheet';
        link.href = './styledark.css';
        document.head.appendChild(link);
        if (themeToggleButton) themeToggleButton.textContent = "Light mode";
    } else {
        // Apply light mode by default
        if (themeToggleButton) themeToggleButton.textContent = "Dark mode";
    }
});

// Function to toggle between light and dark mode
function toggleTheme() {
    const themeToggleButton = document.getElementById('themeToggle');
    const darkModeStylesheet = document.getElementById('darkModeStylesheet');

    if (darkModeStylesheet) {
        // Remove dark mode stylesheet
        darkModeStylesheet.remove();
        themeToggleButton.textContent = "Dark mode";
        // Save the theme preference in localStorage
        localStorage.setItem('theme', 'light');
    } else {
        // Add dark mode stylesheet
        const link = document.createElement('link');
        link.id = 'darkModeStylesheet';
        link.rel = 'stylesheet';
        link.href = './styledark.css';
        document.head.appendChild(link);
        themeToggleButton.textContent = "Light mode";
        // Save the theme preference in localStorage
        localStorage.setItem('theme', 'dark');
    }
}
