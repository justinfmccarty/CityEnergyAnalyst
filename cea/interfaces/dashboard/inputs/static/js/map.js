const {DeckGL, GeoJsonLayer} = deck;
var deckgl;
var jsonStore = {};
// Make sure the layers maintain their order
var layers = [new GeoJsonLayer({id:'streets'}), new GeoJsonLayer({id:'dh_networks'}),
    new GeoJsonLayer({id:'dc_networks'}), new GeoJsonLayer({id:'zone'}), new GeoJsonLayer({id:'district'})];
var extruded = false;
var currentViewState;
var selectedBuilding = '';
var cameraOptions;

const lightMap = {
    "version": 8,
    "sources": {
        "osm-tiles": {
            "type": "raster",
            "tiles": [
                "http://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "http://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "http://b.tile.openstreetmap.org/{z}/{x}/{y}.png"
            ],
            "tileSize": 256,
            "attribution": "Map data © OpenStreetMap contributors"
        }
    },
    "layers": [{
        "id": "osm-tiles",
        "type": "raster",
        "source": "osm-tiles",
        "minzoom": 0,
        "maxzoom": 22
    }]
};

const darkMap = {
    "version": 8,
    "sources": {
        "carto-tiles": {
            "type": "raster",
            "tiles": [
                "https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
                "https://cartodb-basemaps-b.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
                "https://cartodb-basemaps-c.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
            ],
            "tileSize": 256,
            "attribution": "Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
        }
    },
    "layers": [{
        "id": "carto-tiles",
        "type": "raster",
        "source": "carto-tiles",
        "minzoom": 0,
        "maxzoom": 22
    }]
};

const jsonUrls = {
    'streets': '/inputs/geojson/others/streets',
    'dh_networks': '/inputs/geojson/networks/DH',
    'dc_networks': '/inputs/geojson/networks/DC'
};

$(document).ready(function() {
    // Get zone file first. Will not create map if zone file does not exist
    if (geojsons['zone']) {
        createLayer('zone');
        $('#zone-cb').prop('hidden', false);
        currentViewState = {
            latitude: (geojsons['zone'].bbox[1] + geojsons['zone'].bbox[3]) / 2,
            longitude: (geojsons['zone'].bbox[0] + geojsons['zone'].bbox[2]) / 2,
            zoom: 0, bearing: 0, pitch: 0
        };

        if (geojsons['district']) {
            createLayer('district');
            $('#district-cb').prop('hidden', false);
        }

        deckgl = new DeckGL({
            container: 'mapid',
            mapStyle: lightMap,
            viewState: currentViewState,
            layers: layers,
            onViewStateChange: ({viewState}) => {
                currentViewState = viewState;
                deckgl.setProps({viewState: currentViewState});
            },
            onDragStart: (info, event) => {
                if (event.rightButton && !extruded) {
                    toggle3D();
                }
            },
            controller: {dragRotate: false}
        });

        // Set the camera to bounding box
        cameraOptions = deckgl.getMapboxMap().cameraForBounds(
            [[geojsons['zone'].bbox[0], geojsons['zone'].bbox[1]], [geojsons['zone'].bbox[2], geojsons['zone'].bbox[3]]],
            {padding: 10}
        );
        currentViewState = {
            ...currentViewState,
            zoom: cameraOptions.zoom,
            latitude: cameraOptions.center.lat,
            longitude: cameraOptions.center.lng,
            transitionDuration: 300
        };
        deckgl.setProps({viewState: currentViewState});

        setupButtons();
        $('[data-toggle="tooltip"]').tooltip({
            trigger : 'hover',
            container: 'body'
        });

        // Try to get every other input
        $.each(jsonUrls, function (key, value) {
            $.getJSON(value, function (json) {
                $(`#${key}-cb`).prop('hidden', false);
                console.log(json);
                jsonStore[key] = json;
                createLayer(key);
                deckgl.setProps({ layers: [...layers] });
            }).fail(function () {
                console.log(`Get ${key} failed.`);
            });
        });
    }
});

function setupButtons() {
    class dToggle {
      onAdd(map) {
        this._map = map;
        let _this = this;

        this._btn = document.createElement("button");
        this._btn.id = "3d-button";
        this._btn.className = "mapboxgl-ctrl-icon mapboxgl-ctrl-3d";
        this._btn.type = "button";
        this._btn.setAttribute("data-toggle", "tooltip");
        this._btn.setAttribute("data-placement", "right");
        this._btn.setAttribute("title", "Toggle 3D");
        this._btn.onclick = toggle3D;

        this._container = document.createElement("div");
        this._container.className = "mapboxgl-ctrl-group mapboxgl-ctrl";
        this._container.appendChild(this._btn);

        return this._container;
      }

      onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    }

    class darkToggle {
      constructor() {
        this._dark = false;
      }
      onAdd(map) {
        this._map = map;
        let _this = this;

        this._btn = document.createElement("button");
        this._btn.id = "dark-button";
        this._btn.className = "mapboxgl-ctrl-icon";
        this._btn.type = "button";
        this._btn.setAttribute("data-toggle", "tooltip");
        this._btn.setAttribute("data-placement", "right");
        this._btn.setAttribute("title", "Toggle Dark map");
        this._btn.onclick = function() {
            this._dark = !this._dark;
            toggleDark(this._dark);
        };
        this._btn.innerHTML = '<i class="fa fa-adjust"></i>';

        this._container = document.createElement("div");
        this._container.className = "mapboxgl-ctrl-group mapboxgl-ctrl";
        this._container.appendChild(this._btn);

        return this._container;
      }

      onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    }

    class recenterMap {
      onAdd(map) {
        this._map = map;
        let _this = this;

        this._btn = document.createElement("button");
        this._btn.id = "recenter-button";
        this._btn.className = "mapboxgl-ctrl-icon mapboxgl-ctrl-recenter";
        this._btn.type = "button";
        this._btn.setAttribute("data-toggle", "tooltip");
        this._btn.setAttribute("data-placement", "right");
        this._btn.setAttribute("title", "Center to location");
          this._btn.onclick = function () {
              deckgl.setProps({
                  viewState:{
                      ...currentViewState,
                      zoom: cameraOptions.zoom,
                      latitude: cameraOptions.center.lat,
                      longitude: cameraOptions.center.lng,
                      transitionDuration: 300
                  }
              });
          };

        this._container = document.createElement("div");
        this._container.className = "mapboxgl-ctrl-group mapboxgl-ctrl";
        this._container.appendChild(this._btn);

        return this._container;
      }

      onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    }

    deckgl.getMapboxMap().addControl(new dToggle(), 'top-left');
    deckgl.getMapboxMap().addControl(new darkToggle(), 'top-left');
    deckgl.getMapboxMap().addControl(new recenterMap(), 'top-left');
}

function toggle3D() {
    extruded = !extruded;
    var pitch;
    var bearing;
    if (extruded) {
        pitch = 45;
    } else {
        pitch = 0;
        bearing = 0;
    }

    var className = extruded ? "mapboxgl-ctrl-icon mapboxgl-ctrl-2d" : "mapboxgl-ctrl-icon mapboxgl-ctrl-3d";
    $('#3d-button').prop('class', className);


    createLayer('zone', { visible: $('#zone-toggle').prop('checked') });
    createLayer('district', { visible: $('#district-toggle').prop('checked') });
    deckgl.setProps({ layers: [...layers], controller: {dragRotate: extruded},
        viewState:{...currentViewState, pitch: pitch, bearing: bearing, transitionDuration: 300} });
}

function toggleDark(dark) {
    if (dark) {
        deckgl.getMapboxMap().setStyle(darkMap);
    } else {
        deckgl.getMapboxMap().setStyle(lightMap);
    }
}

function toggleLayer(obj) {
    if (obj.checked) {
        createLayer(obj.value, { visible: true });
    } else {
        createLayer(obj.value, { visible: false });
    }
    deckgl.setProps({ layers: [...layers] });
}

function createLayer(name, options={}) {
    switch(name) {
        case 'zone':
            createZoneLayer(options);
            break;
        case 'district':
            createDistrictLayer(options);
            break;
        case 'streets':
            createStreetsLayer(options);
            break;
        case 'dh_networks':
            createDHNetworksLayer(options);
            break;
        case 'dc_networks':
            createDCNetworksLayer(options);
            break;
    }
}

function createDistrictLayer(options={}) {
    layers = layers.filter(layer => layer.id!=='district');

    layers.splice(4, 0, new GeoJsonLayer({
        id: 'district',
        data: geojsons['district'],
        opacity: 0.5,
        extruded: extruded,
        wireframe: true,
        filled: true,

        getElevation: f => f.properties['height_ag'],
        getFillColor: f => buildingColor([255, 0, 0], f.properties['Name']),
        updateTriggers: {
            getFillColor: selectedBuilding
        },

        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 0, 128],

        onHover: updateTooltip,
        onClick: showProperties,

        ...options
    }));
}

function createZoneLayer(options={}) {
    layers = layers.filter(layer => layer.id!=='zone');

    layers.splice(3, 0, new GeoJsonLayer({
        id: 'zone',
        data: geojsons['zone'],
        opacity: 0.5,
        extruded: extruded,
        wireframe: true,
        filled: true,

        getElevation: f => f.properties['height_ag'],
        getFillColor: f => buildingColor([0, 0, 255], f.properties['Name']),
        updateTriggers: {
            getFillColor: selectedBuilding
        },

        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 0, 128],

        onHover: updateTooltip,
        onClick: showProperties,

        ...options
    }));
}

function createStreetsLayer(options={}) {
    layers = layers.filter(layer => layer.id!=='streets');
    layers.splice(0, 0, new GeoJsonLayer({
        id: 'streets',
        data: jsonStore['streets'],

        getLineColor: [255, 0, 0],
        getLineWidth: 3,

        pickable: true,
        autoHighlight: true,

        onHover: updateTooltip,
        onClick: editProperties,

        ...options
    }));
}

function createDHNetworksLayer(options={}) {
    layers = layers.filter(layer => layer.id!=='dh_networks');
    layers.splice(1, 0, new GeoJsonLayer({
        id: 'dh_networks',
        data: jsonStore['dh_networks'],
        stroked: false,
        filled: true,

        getLineColor: [0, 255, 0],
        getFillColor: f => nodeFillColor(f.properties['Type']),
        getLineWidth: 3,
        getRadius: 3,

        pickable: true,
        autoHighlight: true,

        onHover: updateTooltip,
        onClick: editProperties,

        ...options
    }));
}

function createDCNetworksLayer(options={}) {
    layers = layers.filter(layer => layer.id!=='dc_networks');
    layers.splice(2, 0, new GeoJsonLayer({
        id: 'dc_networks',
        data: jsonStore['dc_networks'],
        stroked: false,
        filled: true,

        getLineColor: [0, 255, 244],
        getFillColor: f => nodeFillColor(f.properties['Type']),
        getLineWidth: 3,
        getRadius: 3,

        pickable: true,
        autoHighlight: true,

        onHover: updateTooltip,
        onClick: editProperties,

        ...options
    }));
}

function updateTooltip({x, y, object, layer}) {
    const tooltip = document.getElementById('map-tooltip');

    if (object) {
        tooltip.style.top = `${y}px`;
        tooltip.style.left = `${x}px`;
        var innerHTML = '';
        for (let prop in object.properties) {
            innerHTML += `<div><b>${prop}</b>: ${object.properties[prop]}</div>`;
        }
        if (layer.id == 'zone' || layer.id == 'district') {
            var area = turf.area(object);
            innerHTML += `<br><div><b>area</b>: ${Math.round(area * 1000) / 1000}m<sup>2</sup></div>
            <div><b>volume</b>: ${Math.round(area * object.properties['height_ag'] * 1000) / 1000}m<sup>3</sup></div>`;
        }
        if (layer.id == 'dc_networks' || layer.id == 'dh_networks') {
            if (!object.properties.hasOwnProperty("Building")) {
                var length = turf.length(object) * 1000;
                innerHTML += `<br><div><b>length</b>: ${Math.round(length * 1000) / 1000}m</div>`;
            }
        }
        tooltip.innerHTML = innerHTML;
    } else {
        tooltip.innerHTML = '';
    }
}

function editProperties({object}) {
    console.log(object.properties.Name);
    var pk_field = $('#cea-table').bootstrapTable('getOptions').uniqueId;
    var pk = object.properties[pk_field];
    var row = $('#cea-table').bootstrapTable('getRowByUniqueId', pk);
    edit_row(row);
}

function showProperties({object, layer}) {
    console.log(object.properties);
    var name = object['properties']['Name'];

    //Change the color of the selected building
    selectedBuilding = name;
    createLayer('zone');
    createLayer('district');
    deckgl.setProps({ layers: [...layers] });

    $('#building-name').empty().append(`<h3>Building Properties: ${name}</h3>`);
    $( '#building-properties').empty()
        .append(`<h3>${layer.id.charAt(0).toUpperCase() + layer.id.slice(1)} building</h3>`);
    $.each(tables[layer.id][name], function (k, v) {
                $('#building-properties').append(`<div>${k}:${v}</div>`);
            });
    $.each(tables, function (property, buildings) {
        if (buildings[name] && property !== layer.id) {
            $('#building-properties').append(`<h3>${property}:</h3>`);
            $.each(buildings[name], function (k, v) {
                $('#building-properties').append(`<div>${k}:${v}</div>`);
            });
        }
    });

}

function nodeFillColor(type) {
    if (type === 'NONE') {
        return [100, 100, 100]
    } else if (type === 'CONSUMER') {
        return [255, 255, 255]
    } else if (type === 'PLANT') {
        return [0, 0, 0]
    }
}

function buildingColor(color, name) {
    if (name === selectedBuilding) {
        return [255, 255, 0, 255]
    } else {
        return color
    }
}
