var loadingAnimationId;

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

// Function to search nearby stops based on current GPS location
function searchNearbyStops() {
    // Show loading text
    const loadingAnimationId = showLoadingText();

    // Check if Geolocation is supported by the browser
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            function (position) {
                // Get user's current coordinates
                var userCoordinates = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };

                // API Call to get all bus stops
                $.ajax({
                    url: 'https://apisvt.avanzagrupo.com/lineas/getParadas',
                    type: 'GET',
                    dataType: 'json',
                    success: function (response) {
                        // Calculate distances and find the nearest 6 stops
                        var nearbyStops = findNearestStops(response.data.paradas, userCoordinates, 6);

                        // Display nearby stops
                        displayMatchingStops(nearbyStops, userCoordinates);

                        // Hide loading text when the search is complete
                        hideLoadingText(loadingAnimationId);
                    },
                    error: function () {
                        // Display error message
                        alert('Error fetching bus stop data. Please try again later.');

                        // Hide loading text when there's an error
                        hideLoadingText(loadingAnimationId);
                    }
                });
            },
            function (error) {
                // Handle Geolocation error
                alert('Error getting your current location. Please try again or use manual search.');

                // Hide loading text when there's an error
                hideLoadingText(loadingAnimationId);
            }
        );
    } else {
        // Geolocation is not supported
        alert('Geolocation is not supported by your browser. Please use manual search.');

        // Hide loading text when there's an error
        hideLoadingText(loadingAnimationId);
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

    // We use stop.distance to calculate the distance from the bus stop, since this function does not requiere the user to share location permissiosn, we just set them all to zero

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

    findNearestStops

    // Get the stop name entered by the user
    var stopName = $('#stopNameInput').val().trim();

    // Fetch bus stops data only if a name is provided
    if (stopName) {
        // API Call to get all bus stops
        $.ajax({
            url: 'https://apisvt.avanzagrupo.com/lineas/getParadas',
            type: 'GET',
            dataType: 'json',
            success: function(response) {
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

                // Display matching stops
                displayMatchingStops(matchingStops);

                // Hide loading text when the search is complete
                hideLoadingText();
            },
            error: function() {
                // Display error message
                alert('Error fetching bus stop data. Please try again later.');

                // Hide loading text when there's an error
                hideLoadingText();
            }
        });
    } else {
        // Display message if no name is provided
        alert('Please enter a Stop Name for search.');

        // Hide loading text when the search is complete (even in case of an error)
        hideLoadingText();
    }
}    

// Function to display nearby stops with distances
function displayMatchingStops(stops, userCoordinates) {
    // Clear previous data and ensure there is no loading text
    hideLoadingText();
    $('#stopInfo').empty();

    // Fetch bus lines color data
    $.ajax({
        url: 'https://apisvt.avanzagrupo.com/lineas/getLineas?empresa=10&N=1',
        type: 'GET',
        dataType: 'json',
        success: function (colorResponse) {
            // Create a map to store color information based on line id
            const colorMap = {};
            colorResponse.data.forEach(function (line) {
                colorMap[line.id] = line.color;
            });

            // Display nearby stops in a table
            stops.forEach(function (stop) {
                var stopInfo = $('<div>');

                // Table for Stop ID, Name, and Location link
                var table = $('<table>').addClass('stopInfoTable');

                // Create a new row for the clickable header
                var clickableHeaderRow = $('<tr>');
                var headerLink = $('<a>').attr('href', '#')
                    .click(function () {
                        // Auto-fill the custom Stop ID field and update the page
                        $('#stopIdInput').val(stop.cod);
                        fetchBusData();
                    });

                // Create an image element and set its attributes
                var extLinkImg = $('<img>').attr({
                    src: './img/extlink.png', 
                    alt: 'External Link',
                    width: '13',  // Set the width as needed
                    height: '13'  // Set the height as needed
                });

                // Append the image and text to the link
                headerLink.append(extLinkImg).append(' Stop ID: ' + stop.cod + ' - ' + stop.ds + ' - Distance: ' + stop.distance.toFixed(2) + ' meters');

                // Add "Add to Favorites" button
                var addToFavoritesButton = $('<button>').text('Add to Favorites ★').click(function () {
                    addToFavorites(stop.cod, stop.ds);
                });

                clickableHeaderRow.append($('<th>').append(headerLink).append(addToFavoritesButton));

                var locationLinkRow = $('<tr>').append($('<td>').append($('<a>')
                    .attr('href', 'https://www.google.com/maps?q=' + stop.coordinates[0] + ',' + stop.coordinates[1])
                    .addClass('stopCoordinates')
                    .text('View on Map')));

                // Create a new row for line symbols
                var linesRow = $('<tr>');

                // Display line symbols with dynamically updated colors
                stop.lines.forEach(function (line) {
                    var lineColor = colorMap[line] || '#FF0000'; // Default to red if color not found
                    var lineSymbol = $('<div>').addClass('lineSymbol').text(line).css('background-color', lineColor);
                    linesRow.append($(lineSymbol));
                });

                table.append(clickableHeaderRow, locationLinkRow, linesRow);
                stopInfo.append(table);

                $('#stopInfo').append(stopInfo);
            });
        },
        error: function () {
            // Display error message for color data
            alert('Error fetching bus lines color data. Defaulting to red.');
        }
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
            .click(function () {
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
    var year = timestamp.substr(0, 4);
    var month = timestamp.substr(4, 2);
    var day = timestamp.substr(6, 2);
    return year + '-' + month + '-' + day;
}

function fetchBusData() {
    // Get custom stop ID
    var customStopId = $('#stopIdInput').val().trim();
    if (!customStopId) {
        alert('Please enter a Stop ID.');
        return;
    }


    // API Call
    $.ajax({
        url: 'https://apisvt.avanzagrupo.com/lineas/getTraficosParada?empresa=0-9999&parada=' + customStopId + '&find=',
        type: 'GET',
        dataType: 'json',
        success: function(response) {
            // Clear previous data
            $('#busTable tbody').empty();

            // Update table header with stop info
            $('#stopInfoHeader').text('Stop ID: ' + response.data.parada.cod + ' - ' + response.data.parada.ds);

            // Loop through bus data and add rows to the table
            $.each(response.data.traficos, function(index, bus) {
                // Create a new table row
                var row = $('<tr>');

                // Append data to the row
                row.append($('<td>').text(bus.coLinea));
                row.append($('<td>').text(bus.quedan));
                row.append($('<td>').text(bus.dsDestino));
                    var mapImage = $('<img>').attr('src', './img/pushpin.png').attr('alt', 'View on Map').attr('id', 'icon');
                row.append($('<td>').append($('<a>').attr('href', 'https://www.google.com/maps?q=' + bus.lat + ',' + bus.lon).append(mapImage)));

                // Append the row to the table
                $('#busTable tbody').append(row);
            });

            // Display timestamp information
            $('#timestamp').text('Date: ' + formatDate(response.fxSistema) + ' Last update took: ' + response.time + ' ms');

            // Update status to "Up to date" with green checkmark
            $('#updateStatus').text('Up to date ✔').css('color', '#27ae60'); // Green color
        },
        error: function() {
            // Display error message
            alert('Error fetching data. Please try again later.');
        }
    });
}

// Update timestamp while refreshing
setInterval(function() {
    // Fetch bus data only if Stop ID is provided
    if ($('#stopIdInput').val().trim()) {
        // Show "Updating..." status
        $('#updateStatus').text('Updating...').css('color', '#333'); // Default color

        // Fetch bus data
        fetchBusData();
    }
}, 5000);