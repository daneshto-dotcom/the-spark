import re, json
SRC=r'C:/Users/onesh/OneDrive/Desktop/Claude/Founder DNA/Extension Projects/The Spark/.claude/plans/S192_TEAM_BACKDROP_PROMPTS.md'
s=open(SRC,encoding='utf-8').read()
worlds={}; seams={}
for m in re.finditer(r'### #(\d+) (\w+) \(top\) \+ (\w+) \(bottom\).*?```text\n(.*?)\n```', s, re.S):
    a,b,t=m.group(2).lower(),m.group(3).lower(),m.group(4)
    top=re.search(r'TOP HALF - (.*?) BOTTOM HALF - ',t,re.S).group(1)
    bot=re.search(r'BOTTOM HALF - (.*?) THE SEAM: ',t,re.S)
    if bot: bot=bot.group(1)
    worlds.setdefault(a,top)
    if bot: worlds.setdefault(b,bot)
    sm=re.search(r'THE SEAM: .*? - (.*?) The blend is gradual',t,re.S)
    if sm and a!=b: seams[a+'|'+b]=sm.group(1)
print(len(worlds),sorted(worlds)); print(len(seams))
for k,v in worlds.items(): print(k,'::',v[:90],'...',v[-60:])
for k,v in seams.items(): print(k,'::',v)
json.dump({'worlds':worlds,'seams':seams},open(r'C:/Users/onesh/AppData/Local/Temp/claude/C--Users-onesh-OneDrive-Desktop-Claude-Founder-DNA-Extension-Projects-The-Spark/326e23a9-ee84-407e-83d4-e8832dcf166e/scratchpad/s192.json','w',encoding='utf-8'),indent=1)
