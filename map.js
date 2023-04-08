let neighborhoodsData;
const nycCoords = [-74.006, 40.713];

async function loadData() {
  // import data
  neighborhoodsData = await d3.json("./nyc_neighborhoods.geojson");
  init();
}
loadData();

function init() {
  // mobile intro msg
  const introMobile = document.querySelector("#intro-mobile");
  introMobile.innerHTML = `Enter a NYC address to find its neighborhood`;

  mapboxgl.accessToken = "pk.eyJ1IjoiamVuY2hlIiwiYSI6ImNsZzFvZG5iczFtb2cza3M2NXBpcjg3YWkifQ.8kRUHSY7dqxOwHXh5F00Qg";

  /*-----------
  INITIALIZE MAP
  -----------*/
  const map = new mapboxgl.Map({
    container: "map", // div id
    style: "mapbox://styles/mapbox/satellite-v9",
    center: nycCoords,
    zoom: 10,
  });

  /*-----------------
  INITIALIZE GEOCODER:
  text search: https://docs.mapbox.com/help/tutorials/local-search-geocoding-api/
  coordinates search: https://docs.mapbox.com/mapbox-gl-js/example/mapbox-gl-geocoder-accept-coordinates/
  -----------------*/
  const coordinatesGeocoder = function (query) {
    // decimal degrees coordinate pair
    const matches = query.match(/^[ ]*(?:Lat: )?(-?\d+\.?\d*)[, ]+(?:Lng: )?(-?\d+\.?\d*)[ ]*$/i);
    if (!matches) {
      return null;
    }

    function coordinateFeature(lng, lat) {
      return {
        center: [lng, lat],
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        place_name: "Lat: " + lat + " Lng: " + lng,
        place_type: ["coordinate"],
        properties: {},
        type: "Feature",
      };
    }

    const coord1 = Number(matches[1]);
    const coord2 = Number(matches[2]);
    const geocodes = [];

    if (coord1 < -90 || coord1 > 90) {
      // must be lng, lat
      geocodes.push(coordinateFeature(coord1, coord2));
    }

    if (coord2 < -90 || coord2 > 90) {
      // must be lat, lng
      geocodes.push(coordinateFeature(coord2, coord1));
    }

    if (geocodes.length === 0) {
      // else could be either lng, lat or lat, lng
      geocodes.push(coordinateFeature(coord1, coord2));
      geocodes.push(coordinateFeature(coord2, coord1));
    }

    return geocodes;
  };

  const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    placeholder: "Address or coordinates",
    // NYC boundaries via boundingbox.klokantech.com:
    bbox: [-74.258843, 40.476578, -73.700233, 40.91763],
    proximity: {
      // NYC coordinates
      longitude: nycCoords[0],
      latitude: nycCoords[1],
    },
    mapboxgl: mapboxgl, // set mapbox-gl instance
    marker: false,
    localGeocoder: coordinatesGeocoder,
    reverseGeocode: true,
  });

  map.addControl(geocoder);

  // description box in top left corner that displays neighborhood name after user enters location
  const description = document.getElementById("description-box");
  const startMsg =
    "Enter a NYC address or pair of coordinates &nbsp;<span style='color:#E7B10A;'><i class='fa-solid fa-arrow-right'></i></span><br /><span style='font-weight:300;font-size:0.9em;'>The corresponding neighborhood will appear here</span>";
  description.innerHTML = startMsg;

  // after map style has loaded:
  map.on("load", () => {
    /*-----------
    ADD NEIGHBORHOODS
    -----------*/
    // Add data source for neighborhoods:
    // https://docs.mapbox.com/mapbox-gl-js/example/geojson-polygon/
    map.addSource("neighborhoods", {
      type: "geojson",
      data: "./nyc_neighborhoods.geojson",
    });

    // add layer to show neighbhorhoods and color in boroughs
    map.addLayer({
      id: "neighborhoods-layer",
      type: "fill",
      source: "neighborhoods",
      paint: {
        "fill-color": [
          "match",
          ["get", "borough"],
          "Bronx",
          "#590696",
          "Queens",
          "#C70A80",
          "Manhattan",
          "#E7B10A", //"#006E7F",
          "Staten Island",
          "#FF6000", //"#EE5007",
          "Brooklyn",
          "#009FBD", //"#539165", //"#F8CB2E",
          "transparent", // always include a value for none of the above
        ],
        "fill-opacity": 0.4,
      },
    });

    // add outline for neighborhood boundaries
    map.addLayer({
      id: "boundaries-layer",
      type: "line",
      source: "neighborhoods",
      layout: {},
      paint: {
        "line-color": "#fff",
        "line-width": 1,
      },
    });

    // when clicking a neighborhood, popup gives name
    // https://docs.mapbox.com/mapbox-gl-js/example/polygon-popup-on-click/
    map.on("click", "neighborhoods-layer", e => {
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(e.features[0].properties.neighborhood)
        .addTo(map)
        .addClassName("click-popup");
    });

    // change cursor to hand pointer when mouse is over a neighborhood
    map.on("mouseenter", "neighborhoods-layer", e => {
      map.getCanvas().style.cursor = "pointer";
    });

    // change cursor back to full hand pointer outside of neighborhood boundaries
    map.on("mouseleave", "neighborhoods-layer", () => {
      map.getCanvas().style.cursor = "";
    });

    // Add zoom and rotation controls
    // change position: https://docs.mapbox.com/mapbox-gl-js/example/attribution-position/
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    // recenter map button appears when user drags map
    map.on("movestart", () => {
      if (map.getCenter().lng !== nycCoords[0] && map.getCenter().lat !== nycCoords[1]) {
        // hide mobile intro msg
        introMobile.setAttribute("style", "visibility: hidden");

        document.querySelector(".recenter").setAttribute("style", "visibility: visible");
      }
    });

    /*-----------
    ADD GEOCODER
    -----------*/
    map.addSource("single-point", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
    });

    // add popup container class
    // https://docs.mapbox.com/mapbox-gl-js/api/markers/#popup#addclassname
    popup.addClassName("hover-popup");

    // listen for event from geocoder (i.e. user enters location)
    // zoom in / fly to location and add marker
    geocoder.on("result", e => {
      if (!map.getLayer("single")) {
        map.addLayer({
          source: "single-point",
          id: "single",
          type: "circle",
          paint: {
            "circle-radius": 10,
            "circle-color": "#3452C7",
            "circle-opacity": 1,
            "circle-stroke-color": "#3A98B9",
            "circle-stroke-width": 2,
          },
        });
      }

      map.getSource("single-point").setData(e.result.geometry);

      // smooth zoom
      map.flyTo({
        zoom: 13,
        center: e.result.geometry.coordinates,
      });

      // show corresponding neighborhood in description box
      const inputLngLat = e.result.geometry.coordinates;
      // console.log(`Mapbox says ${e.result.context[0].text}`); // works with text input not coordinate input data

      const checkNYC = d3.geoContains(neighborhoodsData, inputLngLat);

      const inputNabe = checkNYC
        ? neighborhoodsData.features.filter(d => d3.geoContains(d, e.result.geometry.coordinates))[0].properties
            .neighborhood
        : null;

      console.log(e.result);
      // description msg gives neighbhorhood unless loc is outside NYC
      if (checkNYC) {
        description.innerHTML = `<span style="font-weight: 400;">Neighborhood:</span> <span style='color:#e7b10a;'>${inputNabe}</span>`;
      } else {
        description.innerHTML = `<span style='color:#e7b10a;font-weight:normal;'>This location is outside of NYC</span>`;
      }

      map
        .on("mouseenter", "single", () => {
          popup
            .setLngLat(e.result.geometry.coordinates)
            .setHTML(
              checkNYC
                ? `<span style="font-size: 0.85em;">YOU SEARCHED FOR</span><br /><span style="font-weight:800;">${e.result.place_name.match(
                    /^[^,]*/
                  )}</span><div id="hover-popup-mobile"><hr class="popup-line" /><span style="font-size: 0.85em;">IT IS LOCATED IN</span><br /><span class="hover-nabe">${inputNabe}</span></div>`
                : `<span style="font-size: 0.85em;">YOU SEARCHED FOR</span><br /><span style="font-weight:800;">${e.result.place_name.match(
                    /^[^,]*/
                  )}</span></div>`
            )
            .addTo(map);
        })
        .on("mouseleave", "single", () => {
          popup.remove();
        });

      // add recenter map button
      if (e.result.geometry.coordinates[0] != nycCoords[0] && e.result.geometry.coordinates[1] != nycCoords[1]) {
        // hide mobile intro msg
        introMobile.setAttribute("style", "visibility: hidden");

        document.querySelector(".recenter").setAttribute("style", "visibility: visible");
      }

      // when user clicks button
      recenter.addEventListener("click", () => {
        if (map.getLayer("single")) {
          map.removeLayer("single");
        }
      });
    });

    // recenter/recenter map button
    const recenter = document.querySelector(".recenter");
    recenter.innerHTML = `RECENTER MAP&nbsp; <span style="color:#E7B10A;"><i class="fa-solid fa-arrows-rotate"></i></span>`;

    recenter.addEventListener("click", () => {
      const centerPt = new mapboxgl.LngLat(nycCoords[0], nycCoords[1]);

      map.flyTo({
        zoom: 10, // smooth zoom
        center: centerPt,
      });
      geocoder.clear();

      // reshow initial msg in top left
      description.innerHTML = startMsg;

      recenter.setAttribute("style", "visibility: hidden");
    });
  });
}
