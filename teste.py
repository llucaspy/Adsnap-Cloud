import os
from zipfile import ZipFile

# cria pasta base no diretório atual
base_path = os.path.join(os.getcwd(), "metropoles_compra2")
home_path = os.path.join(base_path, "HOME")
internas_path = os.path.join(base_path, "INTERNAS")

os.makedirs(home_path, exist_ok=True)
os.makedirs(internas_path, exist_ok=True)

home_files = {
"300x250.txt": """<script type="text/javascript">
var rnd = window.rnd || Math.floor(Math.random()*10e6);
var pid1221902 = window.pid1221902 || rnd;
var plc1221902 = window.plc1221902 || 0;
var abkw = window.abkw || '';
var absrc = 'https://servedby.metrike.com.br/adserve/;ID=181570;size=300x250;setID=1221902;type=js;sw='+screen.width+';sh='+screen.height+';spr='+window.devicePixelRatio+';kw='+abkw+';pid='+pid1221902+';place='+(plc1221902++)+';rnd='+rnd+';click=%%CLICK_URL_UNESC%%';
var _absrc = absrc.split("type=js"); absrc = _absrc[0] + 'type=js;referrer=' + encodeURIComponent('%%PATTERN:url%%') + _absrc[1];
document.write('<scr'+'ipt src="'+absrc+'" type="text/javascript" referrerpolicy="no-referrer-when-downgrade"></scr'+'ipt>');
</script>""",

"970x250.txt": """<script type="text/javascript">
var rnd = window.rnd || Math.floor(Math.random()*10e6);
var pid1221904 = window.pid1221904 || rnd;
var plc1221904 = window.plc1221904 || 0;
var abkw = window.abkw || '';
var absrc = 'https://servedby.metrike.com.br/adserve/;ID=181570;size=970x250;setID=1221904;type=js;sw='+screen.width+';sh='+screen.height+';spr='+window.devicePixelRatio+';kw='+abkw+';pid='+pid1221904+';place='+(plc1221904++)+';rnd='+rnd+';click=%%CLICK_URL_UNESC%%';
var _absrc = absrc.split("type=js"); absrc = _absrc[0] + 'type=js;referrer=' + encodeURIComponent('%%PATTERN:url%%') + _absrc[1];
document.write('<scr'+'ipt src="'+absrc+'" type="text/javascript" referrerpolicy="no-referrer-when-downgrade"></scr'+'ipt>');
</script>""",

"728x90.txt": """<script type="text/javascript">
var rnd = window.rnd || Math.floor(Math.random()*10e6);
var pid1221906 = window.pid1221906 || rnd;
var plc1221906 = window.plc1221906 || 0;
var abkw = window.abkw || '';
var absrc = 'https://servedby.metrike.com.br/adserve/;ID=181570;size=728x90;setID=1221906;type=js;sw='+screen.width+';sh='+screen.height+';spr='+window.devicePixelRatio+';kw='+abkw+';pid='+pid1221906+';place='+(plc1221906++)+';rnd='+rnd+';click=%%CLICK_URL_UNESC%%';
var _absrc = absrc.split("type=js"); absrc = _absrc[0] + 'type=js;referrer=' + encodeURIComponent('%%PATTERN:url%%') + _absrc[1];
document.write('<scr'+'ipt src="'+absrc+'" type="text/javascript" referrerpolicy="no-referrer-when-downgrade"></scr'+'ipt>');
</script>""",

"970x90.txt": """<script type="text/javascript">
var rnd = window.rnd || Math.floor(Math.random()*10e6);
var pid1221908 = window.pid1221908 || rnd;
var plc1221908 = window.plc1221908 || 0;
var abkw = window.abkw || '';
var absrc = 'https://servedby.metrike.com.br/adserve/;ID=181570;size=970x90;setID=1221908;type=js;sw='+screen.width+';sh='+screen.height+';spr='+window.devicePixelRatio+';kw='+abkw+';pid='+pid1221908+';place='+(plc1221908++)+';rnd='+rnd+';click=%%CLICK_URL_UNESC%%';
var _absrc = absrc.split("type=js"); absrc = _absrc[0] + 'type=js;referrer=' + encodeURIComponent('%%PATTERN:url%%') + _absrc[1];
document.write('<scr'+'ipt src="'+absrc+'" type="text/javascript" referrerpolicy="no-referrer-when-downgrade"></scr'+'ipt>');
</script>""",

"300x600.txt": """<script type="text/javascript">
var rnd = window.rnd || Math.floor(Math.random()*10e6);
var pid1221910 = window.pid1221910 || rnd;
var plc1221910 = window.plc1221910 || 0;
var abkw = window.abkw || '';
var absrc = 'https://servedby.metrike.com.br/adserve/;ID=181570;size=300x600;setID=1221910;type=js;sw='+screen.width+';sh='+screen.height+';spr='+window.devicePixelRatio+';kw='+abkw+';pid='+pid1221910+';place='+(plc1221910++)+';rnd='+rnd+';click=%%CLICK_URL_UNESC%%';
var _absrc = absrc.split("type=js"); absrc = _absrc[0] + 'type=js;referrer=' + encodeURIComponent('%%PATTERN:url%%') + _absrc[1];
document.write('<scr'+'ipt src="'+absrc+'" type="text/javascript" referrerpolicy="no-referrer-when-downgrade"></scr'+'ipt>');
</script>""",

"320x100.txt": """<script type="text/javascript">
var rnd = window.rnd || Math.floor(Math.random()*10e6);
var pid1221912 = window.pid1221912 || rnd;
var plc1221912 = window.plc1221912 || 0;
var abkw = window.abkw || '';
var absrc = 'https://servedby.metrike.com.br/adserve/;ID=181570;size=320x100;setID=1221912;type=js;sw='+screen.width+';sh='+screen.height+';spr='+window.devicePixelRatio+';kw='+abkw+';pid='+pid1221912+';place='+(plc1221912++)+';rnd='+rnd+';click=%%CLICK_URL_UNESC%%';
var _absrc = absrc.split("type=js"); absrc = _absrc[0] + 'type=js;referrer=' + encodeURIComponent('%%PATTERN:url%%') + _absrc[1];
document.write('<scr'+'ipt src="'+absrc+'" type="text/javascript" referrerpolicy="no-referrer-when-downgrade"></scr'+'ipt>');
</script>"""
}

internas_files = {
"300x250.txt": """<script type="text/javascript">
var rnd = window.rnd || Math.floor(Math.random()*10e6);
var pid1221903 = window.pid1221903 || rnd;
var plc1221903 = window.plc1221903 || 0;
var abkw = window.abkw || '';
var absrc = 'https://servedby.metrike.com.br/adserve/;ID=181570;size=300x250;setID=1221903;type=js;sw='+screen.width+';sh='+screen.height+';spr='+window.devicePixelRatio+';kw='+abkw+';pid='+pid1221903+';place='+(plc1221903++)+';rnd='+rnd+';click=%%CLICK_URL_UNESC%%';
var _absrc = absrc.split("type=js"); absrc = _absrc[0] + 'type=js;referrer=' + encodeURIComponent('%%PATTERN:url%%') + _absrc[1];
document.write('<scr'+'ipt src="'+absrc+'" type="text/javascript" referrerpolicy="no-referrer-when-downgrade"></scr'+'ipt>');
</script>"""
# (mantém os outros iguais ao seu script — pode colar direto)
}

# escreve arquivos
for name, content in home_files.items():
    with open(os.path.join(home_path, name), "w", encoding="utf-8") as f:
        f.write(content)

for name, content in internas_files.items():
    with open(os.path.join(internas_path, name), "w", encoding="utf-8") as f:
        f.write(content)

# cria zip na pasta atual
zip_path = os.path.join(os.getcwd(), "metropoles_compra2.zip")

with ZipFile(zip_path, 'w') as zipf:
    for root, dirs, files in os.walk(base_path):
        for file in files:
            full_path = os.path.join(root, file)
            arcname = os.path.relpath(full_path, base_path)
            zipf.write(full_path, arcname)

print(f"ZIP gerado em: {zip_path}")