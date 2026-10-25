import json

# The old KF1 sample card is no longer shipped; only its ID and title are kept, so a browser that still
# holds an untouched copy of it opens on a blank card.
sample = {'sid': 'ASL SCENARIO KF1', 'title': 'Fick\u2019s Cycles'}

tpl = open('/home/claude/asl/src/template.html', encoding='utf-8').read()
js = json.dumps(sample, ensure_ascii=False).replace('</', '<\\/')
import datetime, os
ver = open('/home/claude/asl/src/VERSION').read().strip()
date = os.environ.get('BUILD_DATE') or datetime.date.today().isoformat()
out = tpl.replace('__SAMPLE__', js).replace('__APP_VERSION__', ver).replace('__APP_DATE__', date)
open('/home/claude/asl/asl-scenario-card-maker.html', 'w', encoding='utf-8').write(out)
# the deliverable: a complete page, plus a copy named with its version
page = '<!doctype html>\n<html><head><meta charset="utf-8"></head><body>\n' + out + '\n</body></html>'
open('/home/claude/asl/ASL_Scenario_Card_Maker.html', 'w', encoding='utf-8').write(page)
os.makedirs('/home/claude/asl/dist', exist_ok=True)
open(f'/home/claude/asl/dist/ASL_Scenario_Card_Maker_v{ver}.html', 'w', encoding='utf-8').write(page)
print('v' + ver, date, len(out) // 1024, 'KB')
