# Hike Planner 3D

A hiking planner that runs on your phone. Draw a route on the map or import a GPX, KML or GeoJSON file, and get a 3D model of the hike: walking times for each day, where to sleep, how steep each section is, the forecast, and the chance of each type of weather with a simulation of how it would look.

**Open it:** https://stefanblaj54-crypto.github.io/hike-planner-3d/

## Put it on your phone

- iPhone: open the address in Safari, tap Share, then "Add to Home Screen".
- Android: open it in Chrome, tap the three dots, then "Install app".

Open it from the home-screen icon from then on. Your hikes are stored only on your phone, and saved hikes open without a connection.

## Updates

The app looks for a newer version every time it opens, or comes back to the screen, with a connection. It switches to it by itself: straight away on your hikes list, otherwise when you go back to it. A change pushed to this repository is live about a minute later.

## Free services it uses

No accounts or keys needed: [BRouter](https://brouter.de) for trail routing, OpenStreetMap through Overpass and Nominatim for huts, passes, water and place names, [OpenTopoMap](https://opentopomap.org) for the map, AWS Terrain Tiles for heights, and [Open-Meteo](https://open-meteo.com) for the forecast, the ECMWF ensemble and ERA5 climate records.

How the code is organised, how updates work and how to test a change: [CLAUDE.md](CLAUDE.md).
