$(document).ready(function() {
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
                        fetchLineDetails(line.id);
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
                    const idaName = lineDetails.ida.features[0].properties.name;
                    const vueltaName = lineDetails.vuelta.features[0].properties.name;
                    showJourneyModal(lineId, idaName, vueltaName);
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
    function showJourneyModal(lineId, idaName, vueltaName) {
        const journeyModal = $('#journeyModal');
        const journeyOptions = $('#journeyOptions');

        // Clear any previous options
        journeyOptions.empty();

        // Add ida option
        const idaOption = $('<div>').addClass('journeyOption').text(idaName).click(function() {
            journeyModal.hide();
            fetchStopsForJourney(lineId, 'ida');
        });

        // Add vuelta option
        const vueltaOption = $('<div>').addClass('journeyOption').text(vueltaName).click(function() {
            journeyModal.hide();
            fetchStopsForJourney(lineId, 'vuelta');
        });

        // Append options to the modal
        journeyOptions.append(idaOption).append(vueltaOption);

        // Show the modal
        journeyModal.show();

        // Handle closing the modal
        $('.close').click(function() {
            journeyModal.hide();
        });

        // Close the modal when clicking outside of the modal content
        $(window).click(function(event) {
            if (event.target == journeyModal[0]) {
                journeyModal.hide();
            }
        });
    }

    // Function to fetch and display stops for the chosen journey
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
                    displayStops(stops, response.data[journeyType].features[0].properties.name, journeyType);
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

    // Function to display the stops in the UI
    function displayStops(stops, journeyName, journeyType) {
        const stopsContainer = $('#stopsContainer');
        stopsContainer.empty(); // Clear previous stops

        const title = $('<h3>').text(`Stops for ${journeyName} (${journeyType})`);
        stopsContainer.append(title);

        stops.forEach(function(stop) {
            const stopElement = $('<div>').addClass('stopItem');
            const stopName = $('<span>').addClass('stopName').text(stop.properties.nombre);
            const stopCoordinates = $('<span>').addClass('stopCoordinates').text(`(${stop.geometry.coordinates[1]}, ${stop.geometry.coordinates[0]})`);

            stopElement.append(stopName).append(stopCoordinates);
            stopsContainer.append(stopElement);
        });
    }
});
