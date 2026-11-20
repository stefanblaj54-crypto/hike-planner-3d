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
            vals = {'temperature_2m_max': round(tx, 1), 'temperature_2m_min': round(tn, 1), 'precipitation_sum': p, 'precipitation_hours': ph,
                    'snowfall_sum': round(p * .7, 2) if tx < 1 else 0, 'sunshine_duration': round(sunF * dl), 'daylight_duration': round(dl), 'wind_gusts_10m_max': g, 'weather_code': wc}
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
                             "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "freezing_level_height", "cape", "visibility", "snow_depth"]}
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
    node(5, 46.54516, 7.83831, tourism="alpine_hut", name="Rotstock Hut", ele="2039"),
    node(6, 46.53160, 7.81300, mountain_pass="yes", name="Sefinafurgga", ele="2612"),
    node(7, 46.54735, 7.76154, place="hamlet", name="Griesalp"),
    node(8, 46.53354, 7.76897, tourism="alpine_hut", name="Berghaus Bundalp"),
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
