"""Stand-ins for the services the sandbox cannot reach reliably (Open-Meteo, Overpass)."""
import json, math, random, datetime
from urllib.parse import urlparse, parse_qs, unquote_plus

def _q(url):
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}

# ---------- climate (archive API, daily, several years) ----------
def archive(url):
    q = _q(url)
    zs = [float(z) for z in q['elevation'].split(',')]
    d0 = datetime.date.fromisoformat(q['start_date']); d1 = datetime.date.fromisoformat(q['end_date'])
    want = q['daily'].split(',')
    out = []
    for k, z in enumerate(zs):
        rnd = random.Random(42 + k); reg = random.Random(7)   # same weather on both heights, own noise
        D = {v: [] for v in ['time'] + want}
        d = d0
        while d <= d1:
            doy = d.timetuple().tm_yday; season = math.sin(2 * math.pi * (doy - 110) / 365)
            mean = 8.5 + 9.5 * season - 0.0056 * (z - 600); spread = 9 - 2 * min(1, z / 3000); n = rnd.gauss(0, 3.4)
            tx = mean + spread / 2 + n; tn = mean - spread / 2 + n * .8 + rnd.gauss(0, 1)
            r = reg.random()
            # the kind of day: more storms in summer, more snow and cloud in winter
            if season > .3: kinds = [('fair', .44), ('storm', .26), ('front', .15), ('cloud', .1), ('wind', .05)]
            elif season < -.3: kinds = [('fair', .38), ('front', .22), ('cloud', .22), ('wind', .12), ('storm', .0), ('snowy', .06)]
            else: kinds = [('fair', .45), ('front', .2), ('cloud', .17), ('wind', .1), ('storm', .08)]
            acc = 0; kind = 'fair'
            for kk, pk in kinds:
                acc += pk
                if r < acc: kind = kk; break
            p, ph, sunF, g, wc = {'fair': (0, 0, .82, 30, 1), 'storm': (6, 3, .55, 45, 95), 'front': (15, 10, .08, 55, 63), 'cloud': (.6, 2, .15, 35, 3), 'wind': (.4, 1, .62, 78, 2), 'snowy': (4, 6, .2, 40, 73)}[kind]
            dl = (12 + 3.6 * season) * 3600
            # the wind of the day: where it mostly came from and its strongest speed, typical of the kind of day
            wd0, ws0 = {'fair': (60, 14), 'storm': (225, 22), 'front': (250, 42), 'cloud': (300, 24), 'wind': (330, 58), 'snowy': (20, 30)}[kind]
            wdir = (wd0 + rnd.gauss(0, 25)) % 360; wspd = max(3, ws0 + rnd.gauss(0, 6))
            vals = {'temperature_2m_max': round(tx, 1), 'temperature_2m_min': round(tn, 1), 'precipitation_sum': p, 'precipitation_hours': ph,
                    'snowfall_sum': round(p * .7, 2) if tx < 1 else 0, 'sunshine_duration': round(sunF * dl), 'daylight_duration': round(dl), 'wind_gusts_10m_max': g, 'weather_code': wc, 'wind_direction_10m_dominant': round(wdir), 'wind_speed_10m_max': round(wspd, 1)}
            D['time'].append(d.isoformat())
            for v in want: D[v].append(vals.get(v, 0))
            d += datetime.timedelta(days=1)
        out.append({"latitude": float(q['latitude'].split(',')[k]), "longitude": float(q['longitude'].split(',')[k]), "elevation": z, "timezone": "Europe/Zurich", "daily": D})
    return json.dumps(out)

# ---------- forecast runs (ensemble, daily, 51 members) ----------
def _kind(date):
    return date.toordinal() % 3   # 0 storms in the afternoon, 1 rain front, 2 cold and clear after it

def ensemble(url):
    q = _q(url)
    lats = q['latitude'].split(','); lons = q['longitude'].split(','); zs = [float(z) for z in q['elevation'].split(',')]
    d0 = datetime.date.fromisoformat(q['start_date']); d1 = datetime.date.fromisoformat(q['end_date'])
    want = q['daily'].split(',')
    out = []
    for k, z in enumerate(zs):
        D = {'time': []}
        names = []
        for v in want:
            names += [v] + [f'{v}_member{m:02d}' for m in range(1, 51)]
        for nm in names: D[nm] = []
        d = d0
        while d <= d1:
            D['time'].append(d.isoformat()); kind = _kind(d)
            for m in range(51):
                rr = random.Random(d.toordinal() * 100 + m).random()
                if kind == 0: typ = 'storm' if rr < .6 else 'fair' if rr < .85 else 'front'
                elif kind == 1: typ = 'front' if rr < .7 else 'cloud' if rr < .9 else 'wind'
                else: typ = 'fair' if rr < .55 else 'wind' if rr < .8 else 'cloud'
                base = {0: 17, 1: 8, 2: 4}[kind] + 4 - .0065 * (z - 1500)
                p, ph, cc, g, cape = {'storm': (4, 4, 55, 45, 1200), 'fair': (0, 0, 25, 30, 200), 'front': (12, 9, 95, 55, 50), 'cloud': (1, 3, 90, 35, 20), 'wind': (.5, 1, 55, 72, 10)}[typ]
                vals = {'temperature_2m_max': round(base, 1), 'temperature_2m_min': round(base - 8, 1), 'precipitation_sum': p, 'precipitation_hours': ph,
                        'snowfall_sum': round(p * .7, 2) if base < 1 else 0, 'wind_gusts_10m_max': g, 'cloud_cover_mean': cc, 'cape_max': cape}
                for v in want:
                    D[v if m == 0 else f'{v}_member{m:02d}'].append(vals.get(v, 0))
            d += datetime.timedelta(days=1)
        out.append({"latitude": float(lats[k]), "longitude": float(lons[k]), "elevation": z, "timezone": "Europe/Zurich", "daily": D})
    return json.dumps(out if len(out) > 1 else out[0])

# ---------- forecast (hourly, several points with their own heights) ----------
def forecast(url, tz="Europe/Zurich"):
    q = _q(url)
    lats = q['latitude'].split(','); zs = [float(z) for z in q['elevation'].split(',')]
    d0 = datetime.date.fromisoformat(q['start_date']); d1 = datetime.date.fromisoformat(q['end_date'])
    nd = (d1 - d0).days + 1
    out = []
    for k, z in enumerate(zs):
        H = {v: [] for v in ["time", "temperature_2m", "dew_point_2m", "precipitation", "snowfall", "weather_code", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
                             "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "freezing_level_height", "cape", "visibility", "snow_depth",
                             "wind_speed_850hPa", "wind_direction_850hPa", "wind_speed_700hPa", "wind_direction_700hPa", "geopotential_height_850hPa", "geopotential_height_700hPa"]}
        for day in range(nd):
            date = d0 + datetime.timedelta(days=day)
            for h in range(24):
                diurnal = math.cos(math.pi * (h - 15) / 12)
                kind = _kind(date)
                if kind == 0:
                    T = 17 + 5 * diurnal - .0065 * (z - 1500); Td = T - 7 + (3 if 12 <= h <= 18 else 0)
                    storm = 14 <= h <= 17 and z > 1700
                    cl = 10 if h < 10 else (35 if h < 13 else (70 if storm else 30)); cm = 20 if 12 <= h <= 18 else 5; ch = 30
                    pr = 3.5 if storm else 0; code = 95 if storm else (2 if h >= 11 else 0); cape = 1400 if 11 <= h <= 18 else 300
                    ws, wd, vis, sd = 9 + .004 * z, 230, 35000 if not storm else 4000, 0
                elif kind == 1:
                    T = 8 + 1.5 * diurnal - .0065 * (z - 1500); Td = T - .5
                    rain = 6 <= h <= 19
                    cl, cm, ch = 95, 90, 80; pr = 1.8 if rain else .2; code = 63 if rain else 61; cape = 50
                    ws, wd, vis, sd = 18 + .008 * z, 255, 2500, 0
                else:
                    T = 4 + 5 * diurnal - .0065 * (z - 1500); Td = T - 9
                    cl, cm, ch = 5, 10, 20; pr = 0; code = 1; cape = 0
                    ws, wd, vis, sd = 14 + .01 * z, 340, 60000, (.08 if z > 2300 else 0)
                fl = max(0, z + T / .0065)
                H["time"].append(f"{date.isoformat()}T{h:02d}:00"); H["temperature_2m"].append(round(T, 1)); H["dew_point_2m"].append(round(Td, 1))
                H["precipitation"].append(pr); H["snowfall"].append(round(pr * .7, 2) if T < 0.5 else 0); H["weather_code"].append(code)
                H["cloud_cover_low"].append(cl); H["cloud_cover_mid"].append(cm); H["cloud_cover_high"].append(ch)
                H["wind_speed_10m"].append(round(ws, 1)); H["wind_gusts_10m"].append(round(ws * 1.7, 1)); H["wind_direction_10m"].append(wd)
                H["freezing_level_height"].append(round(fl)); H["cape"].append(cape); H["visibility"].append(vis); H["snow_depth"].append(sd)
                # higher up the wind is stronger and turns clockwise with height, as it does over Europe
                H["wind_speed_850hPa"].append(round(ws * 1.6, 1)); H["wind_direction_850hPa"].append((wd + 12) % 360)
                H["wind_speed_700hPa"].append(round(ws * 2.1, 1)); H["wind_direction_700hPa"].append((wd + 24) % 360)
                H["geopotential_height_850hPa"].append(1520); H["geopotential_height_700hPa"].append(3080)
        out.append({"latitude": float(lats[k]), "longitude": float(q['longitude'].split(',')[k]), "elevation": z, "timezone": tz, "hourly": H})
    return json.dumps(out if len(out) > 1 else out[0])

# ---------- places (Overpass) ----------
def node(i, lat, lon, **tags):
    return {"type": "node", "id": i, "lat": lat, "lon": lon, "tags": tags}

BAER = [
    node(1, 46.6048, 7.9218, place="village", name="Wengen"),
    node(2, 46.5934, 7.9091, place="village", name="Lauterbrunnen"),
    node(3, 46.5590, 7.8925, place="village", name="Mürren"),
    node(4, 46.5466, 7.8916, place="village", name="Gimmelwald"),
    node(5, 46.54516, 7.83831, tourism="alpine_hut", name="Rotstock Hut", ele="2039", phone="+41 33 855 24 64", website="www.example-rotstock.test", opening_hours="Jun 20-Oct 10", reservation="yes", beds="50"),
    node(6, 46.53160, 7.81300, mountain_pass="yes", name="Sefinafurgga", ele="2612"),
    node(7, 46.54735, 7.76154, place="hamlet", name="Griesalp"),
    node(8, 46.53354, 7.76897, tourism="alpine_hut", name="Berghaus Bundalp", phone="+41 33 676 11 92", opening_hours="May 15-Oct 20"),
    node(9, 46.51110, 7.77018, mountain_pass="yes", name="Hohtürli", ele="2778"),
    node(10, 46.51023, 7.77171, tourism="alpine_hut", name="Blüemlisalphütte", ele="2840"),
    node(11, 46.4985, 7.7290, natural="water", name="Oeschinensee"),
    node(12, 46.49554, 7.67126, place="village", name="Kandersteg"),
    node(20, 46.4930, 7.7880, natural="peak", name="Blüemlisalphorn", ele="3661"),
    node(21, 46.5579, 7.8353, natural="peak", name="Schilthorn", ele="2970"),
    node(22, 46.5370, 7.9626, natural="peak", name="Jungfrau", ele="4158"),
    node(23, 46.5097, 7.8364, natural="peak", name="Gspaltenhorn", ele="3436"),
    node(24, 46.4741, 7.7366, natural="peak", name="Doldenhorn", ele="3638"),
    node(25, 46.5197, 7.8210, natural="peak", name="Bütlasse", ele="3193"),
]

def overpass(elements):
    return json.dumps({"version": 0.6, "elements": elements})


# The trail check's Overpass query: real OpenStreetMap paths, marked routes and features around the Bärentrek
# (fetched once from overpass.osm.ch, ODbL), for any query whose boxes overlap that area; nothing elsewhere.
_TRAIL = None
def trail(query):
    global _TRAIL
    import gzip, os, re
    boxes = [tuple(map(float, b)) for b in re.findall(r'\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)', query)]
    near = any(s < 46.62 and n > 46.47 and w < 7.95 and e > 7.62 for s, w, n, e in boxes)
    if not near:
        return json.dumps({"elements": []})
    if _TRAIL is None:
        _TRAIL = gzip.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "osm_baerentrek.json.gz")).read().decode()
    return _TRAIL


# the official Swiss hiking trails (swisstopo's swissTLM3D, through geo.admin.ch identify): the features along the Bärentrek,
# collected from the real service in November 2026 (tests/swiss_trails_baerentrek.json.gz), those whose box meets the asked extent
_SWT = None
def swiss_trails(url):
    global _SWT
    import gzip, os
    if _SWT is None:
        _SWT = json.load(gzip.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "swiss_trails_baerentrek.json.gz"), "rt"))
    qs = parse_qs(urlparse(url).query)
    w, s, e, n = map(float, qs.get("mapExtent", ["0,0,0,0"])[0].split(","))
    out = []
    for f in _SWT:
        co = f["g"]["coordinates"] if f["g"]["type"] == "LineString" else [p for l in f["g"]["coordinates"] for p in l]
        xs = [p[0] for p in co]; ys = [p[1] for p in co]
        if min(xs) <= e and max(xs) >= w and min(ys) <= n and max(ys) >= s:
            out.append({"layerBodId": "ch.swisstopo.swisstlm3d-wanderwege", "featureId": f["id"], "properties": {"hikingtype": f["t"]}, "geometry": f["g"]})
    return json.dumps({"results": out})


# BRouter for the easier way: a path from the first point to the last that bows out to one side (as a way round would),
# graded T2, with WayTags the app reads; "nogo" circles only make it bow a little more
def brouter(url):
    qs = parse_qs(urlparse(url).query)
    pts = [tuple(map(float, p.split(","))) for p in qs.get("lonlats", [""])[0].split("|") if p]
    (lo0, la0), (lo1, la1) = pts[0], pts[-1]
    car = qs.get("profile", [""])[0] == "car-fast"
    if car and _dist(la1, lo1, 46.6052, 7.9206) < 800: return "target island detected for section 0\n"   # Wengen has no road
    kx = 111320 * math.cos(math.radians((la0 + la1) / 2)); ky = 110540
    dx, dy = (lo1 - lo0) * kx, (la1 - la0) * ky; L = math.hypot(dx, dy) or 1
    bow = .18 if "nogos" in qs else .08
    co, msgs = [], [["Longitude", "Latitude", "Elevation", "Distance", "CostPerKm", "ElevCost", "TurnCost", "NodeCost", "InitialCost", "WayTags", "NodeTags", "Time", "Energy"]]
    n = 40
    for k in range(n + 1):
        t = k / n; off = math.sin(math.pi * t) * bow * L
        x, y = dx * t - dy / L * off, dy * t + dx / L * off
        lon, lat = lo0 + x / kx, la0 + y / ky
        co.append([round(lon, 6), round(lat, 6), 1500.0])
        if k % 4 == 0 and k: msgs.append([str(round(lon * 1e6)), str(round(lat * 1e6)), "1500", "100", "1000", "0", "0", "0", "0", "highway=path sac_scale=mountain_hiking", "", "0", "0"])
    length = sum(math.hypot((co[k][0] - co[k - 1][0]) * kx, (co[k][1] - co[k - 1][1]) * ky) for k in range(1, len(co)))
    props = {"creator": "mock", "track-length": str(round(length)), "filtered ascend": "120", "messages": msgs}
    if car: props["total-time"] = str(round(length / 1000 / 55 * 3600))   # 55 km/h
    return json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": props, "geometry": {"type": "LineString", "coordinates": co}}]})

# ---------- the Swiss timetable (transport.opendata.ch) ----------
# Stops near two places on the Bärentrek and anywhere else; connections every hour at :14, about two hours with changes, the last at
# 21:14. Like the real one, the timetable reaches only some weeks ahead: dates more than 100 days ahead answer 400 with the window,
# dates 40 to 100 days ahead come back empty (announced but not loaded).
STOPS = [("8507475", "Kandersteg", 46.495394, 7.671415, "train"), ("8576371", "Kandersteg, Bahnhof", 46.495394, 7.67181, "bus"),
         ("8507372", "Wengen", 46.604903, 7.921003, "train"), ("8507356", "Wengen (Männlichenbahn)", 46.6043, 7.9226, "cableway")]
def _dist(la1, lo1, la2, lo2):
    return math.hypot((la2 - la1) * 111200, (lo2 - lo1) * 111200 * math.cos(math.radians(la1)))
def transport(url):
    q = parse_qs(urlparse(url).query)
    g = lambda k, d=None: q.get(k, [d])[0]
    if "/locations" in url:
        la, lo = float(g("x")), float(g("y"))
        st = sorted(({"id": i, "name": n, "score": None, "coordinate": {"type": "WGS84", "x": a, "y": b}, "distance": round(_dist(la, lo, a, b)), "icon": ic}
                     for i, n, a, b, ic in STOPS), key=lambda s: s["distance"])
        if st[0]["distance"] > 3000:   # somewhere else: a made-up stop 300 m away
            st = [{"id": "85%05d" % (int(abs(la * 1000 + lo * 100)) % 100000), "name": "Stop near %.3f, %.3f" % (la, lo), "score": None,
                   "coordinate": {"type": "WGS84", "x": la + .002, "y": lo + .002}, "distance": 300, "icon": "bus"}]
        return 200, json.dumps({"stations": st[:6]})
    d = datetime.date.fromisoformat(g("date")); today = datetime.date.today(); ahead = (d - today).days
    if ahead > 100:
        end = today + datetime.timedelta(days=100)
        return 400, json.dumps({"errors": [{"message": 'The router answered 400: {"error":"query time %s 14:00 is outside of loaded timetable window [%s 00:00, %s 00:00["}' % (d, today - datetime.timedelta(days=8), end)}]})
    if ahead > 40:
        return 200, json.dumps({"connections": []})
    name = {s[0]: s[1] for s in STOPS}
    fa, ta = name.get(g("from"), "Start stop"), name.get(g("to"), "End stop")
    def one(h):
        t = lambda hh, mm: "%sT%02d:%02d:00+0100" % (d, hh, mm)
        legs = [("RE", "1", fa, h, 14, "Spiez", h, 44, "2"), ("IC", "61", "Spiez", h + 1, 5, "Interlaken West", h + 1, 22, "1"),
                ("R", "62", "Interlaken West", h + 1, 27, "Lauterbrunnen", h + 1, 56, "2"), ("CC", "63", "Lauterbrunnen", h + 2, 0, ta, h + 2, 11, "3")]
        secs = []
        for k, n, a, ah, am, b, bh, bm, pl in legs:
            secs.append({"journey": {"category": k, "number": n, "operator": "BLS", "to": b}, "walk": None,
                         "departure": {"station": {"name": a}, "departure": t(ah, am), "platform": pl}, "arrival": {"station": {"name": b}, "arrival": t(bh, bm), "platform": "1"}})
            if b == "Interlaken West":
                secs.append({"journey": None, "walk": {"duration": 180}, "departure": {"station": {"name": b}, "departure": t(bh, bm), "platform": ""},
                             "arrival": {"station": {"name": b}, "arrival": t(bh, bm + 3), "platform": ""}})
        return {"from": {"departure": t(h, 14), "platform": "2"}, "to": {"arrival": t(h + 2, 11), "platform": "3"}, "duration": "00d01:57:00", "transfers": 3, "sections": secs}
    if g("isArrivalTime") == "1":
        return 200, json.dumps({"connections": [one(h) for h in (19, 20, 21)]})
    hh, mm = map(int, g("time", "08:00").split(":")); h0 = hh if mm <= 14 else hh + 1
    return 200, json.dumps({"connections": [one(h) for h in range(h0, min(22, h0 + 4))]})

# ---------- stations and bus stops near the ends of a hike outside Switzerland (Overpass) ----------
def stops(query):
    import re
    els, k = [], 0
    for r, la, lo in re.findall(r'around:(\d+),(-?[\d.]+),(-?[\d.]+)', query):
        la, lo = float(la), float(lo); k += 1
        if r == "5000": els.append(node(900000 + k, la + .016, lo + .004, railway="station", name="Gara %d" % k))
        else: els.append(node(910000 + k, la + .0035, lo, highway="bus_stop", name="Stația %d" % k))
    return overpass(els)
