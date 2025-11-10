Here’s a short brief you can drop into your GitHub Copilot “agent” (README / code header) plus the official links for the OSM tag lists.

---

# Goal

Produce **two GeoJSON layers** from OpenStreetMap for any bbox:

1. **sealed** (impervious) surfaces
2. **unsealed** (pervious) surfaces

These will be fetched via **Overpass API**, not Mapbox, so we can work with real polygons instead of rendered tiles. The result can be styled on top of Mapbox Satellite in the frontend.

## What we treat as sealed vs unsealed (pragmatic defaults)

**Sealed (polygons):**

* `building=*` (all buildings). ([OpenStreetMap][1])
* `amenity=parking` (parking lots). ([OpenStreetMap][2])
* `landuse=industrial|commercial|retail` (built-up parcels – proxy for impervious). ([OpenStreetMap][3])
* `aeroway=apron|runway|taxiway` (paved airport surfaces). ([OpenStreetMap][4])
* Optional: `highway=pedestrian` **with** `area=yes` (plazas). Background on areas: ([OpenStreetMap][5])

**Unsealed (polygons):**

* `natural=wood|grassland|scrub|heath|sand|bare_rock|wetland`. ([OpenStreetMap][6])
* `landuse=forest|farmland|meadow|grass|orchard|vineyard`. ([OpenStreetMap][3])
* `leisure=park` (mostly pervious overall). ([OpenStreetMap][7])

> Refinement key: **`surface=*`** — use it to split paved vs unpaved (e.g., `paved|asphalt|concrete` vs `unpaved|gravel|ground|grass`). Full value list here: **Key:surface** and its value table. ([OpenStreetMap][8])

## Overpass API references

* Overpass API main page & language guide (QL syntax, examples). ([OpenStreetMap][9])
* OSM Map Features (master tag list). ([OpenStreetMap][1])

---

## Overpass QL queries (bbox placeholders)

### 1) Sealed polygons

```ql
[out:json][timeout:180];
(
  way[building]({{bbox}});
  relation[building]({{bbox}});

  way["amenity"="parking"]({{bbox}});
  relation["amenity"="parking"]({{bbox}});

  way["landuse"~"^(industrial|commercial|retail)$"]({{bbox}});
  relation["landuse"~"^(industrial|commercial|retail)$"]({{bbox}});

  way["aeroway"~"^(apron|runway|taxiway)$"]({{bbox}});
  relation["aeroway"~"^(apron|runway|taxiway)$"]({{bbox}});

  way["highway"="pedestrian"]["area"="yes"]({{bbox}});
  relation["highway"="pedestrian"]["area"="yes"]({{bbox}});
);
out body; >; out skel qt;
```

### 2) Unsealed polygons

```ql
[out:json][timeout:180];
(
  way["natural"~"^(wood|grassland|scrub|heath|sand|bare_rock|wetland)$"]({{bbox}});
  relation["natural"~"^(wood|grassland|scrub|heath|sand|bare_rock|wetland)$"]({{bbox}});

  way["landuse"~"^(forest|farmland|meadow|grass|orchard|vineyard)$"]({{bbox}});
  relation["landuse"~"^(forest|farmland|meadow|grass|orchard|vineyard)$"]({{bbox}});

  way["leisure"="park"]({{bbox}});
  relation["leisure"="park"]({{bbox}});
);
out body; >; out skel qt;
```

### Notes for Copilot

* Replace `{{bbox}}` with `(minLat,minLon,maxLat,maxLon)` before POSTing to `https://overpass-api.de/api/interpreter`. Overpass docs and examples: ([OpenStreetMap][9])
* Convert Overpass JSON → GeoJSON. A quick route is `osmnx.utils_geo.json_to_gdf(...)` and then write `GeoJSON`. (OSM tag definitions live under “Map features”.) ([OpenStreetMap][1])
* Roads `highway=*` are usually **lines**; if you need them in the sealed layer, buffer by width using `width=*` if present or a default. Area guidance: ([OpenStreetMap][5])
* For better accuracy, use `surface=*` to reclassify features (e.g., `leisure=pitch` with `surface=grass` → unsealed; with `surface=asphalt` → sealed). Full `surface` wiki page and values: **Key:surface** and **Map Features:surface**. ([OpenStreetMap][8])

---

## Direct links you asked for

* **Complete list & meaning of OSM tags:** Map Features. ([OpenStreetMap][1])
* **Landuse tags (industrial/commercial/retail etc.):** Key:landuse + value table. ([OpenStreetMap][3])
* **Parking:** amenity=parking. ([OpenStreetMap][2])
* **Aeroway paved areas:** aeroway=apron, aeroway=taxiway. ([OpenStreetMap][4])
* **Natural landcover (wood/grassland/etc.):** Key:natural. ([OpenStreetMap][6])
* **Parks:** leisure=park. ([OpenStreetMap][7])
* **Surface key + lists of typical values (paved vs unpaved):** Key:surface; Map Features:surface table. ([OpenStreetMap][8])

If you want, I can plug your Düsseldorf bbox into these queries and return ready-to-use `sealed.geojson` and `unsealed.geojson`.

[1]: https://wiki.openstreetmap.org/wiki/Map_features?utm_source=chatgpt.com "Map features - OpenStreetMap Wiki"
[2]: https://wiki.openstreetmap.org/wiki/Tag%3Aamenity%3Dparking?utm_source=chatgpt.com "Tag:amenity=parking - OpenStreetMap Wiki"
[3]: https://wiki.openstreetmap.org/wiki/Key%3Alanduse?utm_source=chatgpt.com "Key:landuse"
[4]: https://wiki.openstreetmap.org/wiki/Tag%3Aaeroway%3Dapron?utm_source=chatgpt.com "Tag:aeroway=apron"
[5]: https://wiki.openstreetmap.org/wiki/OpenStreetMap_Carto/Areas?utm_source=chatgpt.com "OpenStreetMap Carto/Areas"
[6]: https://wiki.openstreetmap.org/wiki/Key%3Anatural?utm_source=chatgpt.com "Key:natural - OpenStreetMap Wiki"
[7]: https://wiki.openstreetmap.org/wiki/Tag%3Aleisure%3Dpark?utm_source=chatgpt.com "Tag:leisure=park - OpenStreetMap Wiki"
[8]: https://wiki.openstreetmap.org/wiki/Key%3Asurface?utm_source=chatgpt.com "Key:surface"
[9]: https://wiki.openstreetmap.org/wiki/Overpass_API?utm_source=chatgpt.com "Overpass API"
