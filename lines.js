$(document).ready(function() {
        const $element = $('#your-element-id');
    if ($element.length > 0) {
        const value = $element.val();
        console.log(value);
    } else {
        console.error('Element with ID "your-element-id" does not exist');
    }
    const API_BASE_URL = 'https://apisvt.avanzagrupo.com/lineas/';
    const LINES_API_URL = API_BASE_URL + 'getLineas?empresa=10-21&N=1';

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

    // Fetch bus lines data from the API
    showLoadingOverlay(); // Show loading animation
    $.ajax({
        url: LINES_API_URL,
        type: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.status === 'ok') {
                const lines = response.data;
                const linesContainer = $('#linesContainer');
                linesContainer.empty(); // Clear existing content

                lines.forEach(function(line) {
                    const lineElement = $('<div>').addClass('lineItem').css('cursor', 'pointer');
                    const lineSymbol = $('<div>').addClass('lineSymbol').css('background-color', line.color).text(line.id);
                    const lineName = $('<span>').addClass('lineName').text(line.name);

                    lineElement.append(lineSymbol).append(lineName);
                    lineElement.click(function() {
                        fetchLineDetails(line.id); // Fetch line details when clicked
                    });

                    linesContainer.append(lineElement);
                });
            } else {
                console.error('Failed to load bus lines:', response);
                $('#linesContainer').text('Failed to load bus lines. Please try again later.');
            }
            hideLoadingOverlay(); // Hide after all lines are appended
        },
        error: function(xhr, status, error) {
            console.error('Error fetching bus lines:', error);
            $('#linesContainer').text('Error fetching bus lines. Please check your connection.');
            hideLoadingOverlay(); // Hide on error
        }
    });

    // Function to fetch line details and show the journey selection dialog
    function fetchLineDetails(lineId) {
        showLoadingOverlay(); // Show loading for line details
        const stopsApiUrl = `${API_BASE_URL}getDetalleLinea?empresa=10-21&linea=${lineId}`;

        $.ajax({
            url: stopsApiUrl,
            type: 'GET',
            dataType: 'json',
            success: function(response) {
                hideLoadingOverlay(); // Hide after response
                if (response.status === 'ok') {
                    const lineDetails = response.data;
                    showJourneyModal(lineId); // Show the journey selection prompt
                } else {
                    console.error('Failed to load line details:', response);
                    $('#linesContainer').text('Failed to load line details. Please try again later.');
                }
            },
            error: function(xhr, status, error) {
                hideLoadingOverlay(); // Hide on error
                console.error('Error fetching line details:', error);
                $('#linesContainer').text('Error fetching line details. Please check your connection.');
            }
        });
    }

    // Function to show the journey selection modal
    function showJourneyModal(lineId) {
        const journeyModal = $('#journeyModal');
        const journeyOptions = $('#journeyOptions');
    
        // Clear any previous options
        journeyOptions.empty();
    
        // Add "Ida" option
        const idaOption = $('<div>').addClass('journeyOption').text('Outbound Journey').click(function () {
            journeyModal.hide();
            fetchStopsForJourney(lineId, 'ida');
            hideAllLines();
        });
    
        // Add "Vuelta" option
        const vueltaOption = $('<div>').addClass('journeyOption').text('Return Journey').click(function () {
            journeyModal.hide();
            fetchStopsForJourney(lineId, 'vuelta');
            hideAllLines();
        });
    
        // Append options to the modal
        journeyOptions.append(idaOption).append(vueltaOption);
    
        // Show the modal
        journeyModal.show();
    
        // Handle closing the modal
        $('.close').click(function () {
            journeyModal.hide();
        });
    
        // Close the modal when clicking outside of the modal content
        $(window).click(function (event) {
            if (event.target == journeyModal[0]) {
                journeyModal.hide();
            }
        });
    }
    
    function hideAllLines() {
        $('#linesContainer').hide(); // Hide all lines
        $('#stopsContainer').show(); // Show stops container
        ensureBackButton(); // Ensure back button appears at the top
    }
    
    function hideAllLines() {
        $('#linesContainer').hide(); // Hide all lines
        $('#stopsContainer').show(); // Show stops container
        ensureBackButton(); // Ensure the back button is added
    }
    
    function ensureBackButton() {
        // Check if the button already exists to avoid duplicates
        if ($('#backButton').length === 0) {
            const backButton = $('<button>')
                .attr('id', 'backButton')
                .text('Back to All Lines')
                .addClass('backButton')
                .click(function () {
                    $('#linesContainer').show(); // Show all lines
                    $('#stopsContainer').hide(); // Hide the stops view
                    backButton.remove(); // Remove the back button
                });
    
            // Append below "Available Bus Lines" heading
            $('h2').after(backButton);
        }
    }

    // Function to fetch and display stops for the selected journey
    function fetchStopsForJourney(lineId, journeyType) {
        showLoadingOverlay(); // Show loading for stops
        const stopsApiUrl = `${API_BASE_URL}getDetalleLinea?empresa=10-21&linea=${lineId}`;

        $.ajax({
            url: stopsApiUrl,
            type: 'GET',
            dataType: 'json',
            success: function(response) {
                hideLoadingOverlay(); // Hide after response
                if (response.status === 'ok') {
                    const stops = response.data[journeyType].features.filter(feature => feature.geometry.type === 'Point');
                    displayStops(stops, journeyType); // Display stops for the selected journey
                } else {
                    console.error('Failed to load stops:', response);
                    $('#stopsContainer').text('Failed to load stops. Please try again later.');
                }
            },
            error: function(xhr, status, error) {
                hideLoadingOverlay(); // Hide on error
                console.error('Error fetching stops:', error);
                $('#stopsContainer').text('Error fetching stops. Please check your connection.');
            }
        });
    }

    // Function to display the stops in the UI with pin emoji and map
    function displayStops(stops, journeyType) {
        const stopsContainer = $('#stopsContainer');
        stopsContainer.empty(); // Clear previous stops
    
       // const title = $('<h3>').text(`Stops for ${journeyType === 'ida' ? 'Outbound' : 'Return'} Journey`);
       // stopsContainer.append(title);
    
        // Create the bus line diagram container
        const diagramContainer = $('<div>').addClass('busLineDiagram');
        const line = $('<div>').addClass('line');
        diagramContainer.append(line);
    
        stops.forEach(function(stop) {
            const stopItem = $('<div>').addClass('stopItem');
    
            // Stop marker (circle)
            const stopCircle = $('<div>').addClass('stopCircle');
            stopItem.append(stopCircle);
    
            // Stop label as a clickable link
            const stopLabel = $('<span>').addClass('stopLabel').text(stop.properties.nombre);
    
            // Click event to open Google Maps with the stop coordinates
            stopLabel.click(function () {
                const latitude = stop.geometry.coordinates[1];
                const longitude = stop.geometry.coordinates[0];
                const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
                window.open(googleMapsUrl, '_blank');
            });
    
            stopItem.append(stopLabel);
    
            diagramContainer.append(stopItem);
        });
    
        stopsContainer.append(diagramContainer);
    }
        
    // Function to open the map modal and show stop location using OpenStreetMap
    function openStopLocationModal(lat, lon) {
        const modal = $('#stopLocationModal');
        const mapContainer = $('#stopMapContainer');

        // Initialize the map with OpenStreetMap
        const map = L.map(mapContainer[0]).setView([lat, lon], 15); // Set zoom level to 15 for better view
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Add a marker at the stop location
        L.marker([lat, lon]).addTo(map)
            .bindPopup('<b>Stop Location</b>')
            .openPopup();

        // Show the modal
        modal.show();

        // Handle closing the modal
        $('.close').click(function() {
            modal.hide();
            map.remove(); // Remove the map instance to clean up
        });

        // Close the modal when clicking outside of the modal content
        $(window).click(function(event) {
            if (event.target == modal[0]) {
                modal.hide();
                map.remove(); // Clean up the map instance
            }
        });
    }
});