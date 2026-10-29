import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # the repository folder
P = lambda *a: os.path.join(ROOT, *a)

# The old KF1 sample card is no longer shipped; only its ID and title are kept, so a browser that still
# holds an untouched copy of it opens on a blank card.
sample = {'sid': 'ASL SCENARIO KF1', 'title': 'Fick\u2019s Cycles'}

tpl = open(P('src', 'template.html'), encoding='utf-8').read()
js = json.dumps(sample, ensure_ascii=False).replace('</', '<\\/')
import datetime
ver = open(P('src', 'VERSION')).read().strip()
date = os.environ.get('BUILD_DATE') or datetime.date.today().isoformat()
tpl = tpl.replace('/*__VASL_JS__*/', open(P('src', 'vasl.js'), encoding='utf-8').read())
tpl = tpl.replace('/*__BOARDS_JS__*/', open(P('src', 'boards.js'), encoding='utf-8').read())
out = tpl.replace('__SAMPLE__', js).replace('__APP_VERSION__', ver).replace('__APP_DATE__', date)
open(P('asl-scenario-card-maker.html'), 'w', encoding='utf-8').write(out)
# the deliverable: a complete page, plus a copy named with its version
page = '<!doctype html>\n<html><head><meta charset="utf-8"></head><body>\n' + out + '\n</body></html>'
open(P('ASL_Scenario_Card_Maker.html'), 'w', encoding='utf-8').write(page)
os.makedirs(P('dist'), exist_ok=True)
open(P('dist', f'ASL_Scenario_Card_Maker_v{ver}.html'), 'w', encoding='utf-8').write(page)
print('v' + ver, date, len(out) // 1024, 'KB')
