import{u as Y,an as K,z as q,x as X,p as P,a7 as b,H as v,a0 as H,a1 as N,q as M,i as C,C as L,ab as m,ac as f,bf as k,aP as B,c as $,a8 as j,aO as J,be as Q,M as Z,bi as tt,b9 as et}from"./index-KQaaBM--.js";import{bA as gt}from"./index-KQaaBM--.js";import{v as ot}from"./defaultFilter.vert-Dw338EcB.js";var nt=`
in vec2 vTextureCoord;
in vec4 vColor;

out vec4 finalColor;

uniform float uColorMatrix[20];
uniform float uAlpha;

uniform sampler2D uTexture;

float rand(vec2 co)
{
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main()
{
    vec4 color = texture(uTexture, vTextureCoord);
    float randomValue = rand(gl_FragCoord.xy * 0.2);
    float diff = (randomValue - 0.5) *  0.5;

    if (uAlpha == 0.0) {
        finalColor = color;
        return;
    }

    if (color.a > 0.0) {
        color.rgb /= color.a;
    }

    vec4 result;

    result.r = (uColorMatrix[0] * color.r);
        result.r += (uColorMatrix[1] * color.g);
        result.r += (uColorMatrix[2] * color.b);
        result.r += (uColorMatrix[3] * color.a);
        result.r += uColorMatrix[4];

    result.g = (uColorMatrix[5] * color.r);
        result.g += (uColorMatrix[6] * color.g);
        result.g += (uColorMatrix[7] * color.b);
        result.g += (uColorMatrix[8] * color.a);
        result.g += uColorMatrix[9];

    result.b = (uColorMatrix[10] * color.r);
       result.b += (uColorMatrix[11] * color.g);
       result.b += (uColorMatrix[12] * color.b);
       result.b += (uColorMatrix[13] * color.a);
       result.b += uColorMatrix[14];

    result.a = (uColorMatrix[15] * color.r);
       result.a += (uColorMatrix[16] * color.g);
       result.a += (uColorMatrix[17] * color.b);
       result.a += (uColorMatrix[18] * color.a);
       result.a += uColorMatrix[19];

    vec3 rgb = mix(color.rgb, result.rgb, uAlpha);

    // Premultiply alpha again.
    rgb *= result.a;

    finalColor = vec4(rgb, result.a);
}
`,F=`struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct ColorMatrixUniforms {
  uColorMatrix:array<vec4<f32>, 5>,
  uAlpha:f32,
};


@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> colorMatrixUniforms : ColorMatrixUniforms;


struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>,
  };
  
fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;

    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>, 
) -> VSOutput {
  return VSOutput(
   filterVertexPosition(aPosition),
   filterTextureCoord(aPosition),
  );
}


@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
) -> @location(0) vec4<f32> {


  var c = textureSample(uTexture, uSampler, uv);
  
  if (colorMatrixUniforms.uAlpha == 0.0) {
    return c;
  }

 
    // Un-premultiply alpha before applying the color matrix. See issue #3539.
    if (c.a > 0.0) {
      c.r /= c.a;
      c.g /= c.a;
      c.b /= c.a;
    }

    var cm = colorMatrixUniforms.uColorMatrix;


    var result = vec4<f32>(0.);

    result.r = (cm[0][0] * c.r);
    result.r += (cm[0][1] * c.g);
    result.r += (cm[0][2] * c.b);
    result.r += (cm[0][3] * c.a);
    result.r += cm[1][0];

    result.g = (cm[1][1] * c.r);
    result.g += (cm[1][2] * c.g);
    result.g += (cm[1][3] * c.b);
    result.g += (cm[2][0] * c.a);
    result.g += cm[2][1];

    result.b = (cm[2][2] * c.r);
    result.b += (cm[2][3] * c.g);
    result.b += (cm[3][0] * c.b);
    result.b += (cm[3][1] * c.a);
    result.b += cm[3][2];

    result.a = (cm[3][3] * c.r);
    result.a += (cm[4][0] * c.g);
    result.a += (cm[4][1] * c.b);
    result.a += (cm[4][2] * c.a);
    result.a += cm[4][3];

    var rgb = mix(c.rgb, result.rgb, colorMatrixUniforms.uAlpha);

    rgb.r *= result.a;
    rgb.g *= result.a;
    rgb.b *= result.a;

    return vec4(rgb, result.a);
}`;class rt extends Y{constructor(t={}){const e=new K({uColorMatrix:{value:[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0],type:"f32",size:20},uAlpha:{value:1,type:"f32"}}),o=q.from({vertex:{source:F,entryPoint:"mainVertex"},fragment:{source:F,entryPoint:"mainFragment"}}),n=X.from({vertex:ot,fragment:nt,name:"color-matrix-filter"});super({...t,gpuProgram:o,glProgram:n,resources:{colorMatrixUniforms:e}}),this.alpha=1}_loadMatrix(t,e=!1){if(e){const o=[...t];this._multiply(o,this.matrix,t),this.resources.colorMatrixUniforms.uniforms.uColorMatrix=o}else this.resources.colorMatrixUniforms.uniforms.uColorMatrix=t;this.resources.colorMatrixUniforms.update()}_multiply(t,e,o){return t[0]=e[0]*o[0]+e[1]*o[5]+e[2]*o[10]+e[3]*o[15],t[1]=e[0]*o[1]+e[1]*o[6]+e[2]*o[11]+e[3]*o[16],t[2]=e[0]*o[2]+e[1]*o[7]+e[2]*o[12]+e[3]*o[17],t[3]=e[0]*o[3]+e[1]*o[8]+e[2]*o[13]+e[3]*o[18],t[4]=e[0]*o[4]+e[1]*o[9]+e[2]*o[14]+e[3]*o[19]+e[4],t[5]=e[5]*o[0]+e[6]*o[5]+e[7]*o[10]+e[8]*o[15],t[6]=e[5]*o[1]+e[6]*o[6]+e[7]*o[11]+e[8]*o[16],t[7]=e[5]*o[2]+e[6]*o[7]+e[7]*o[12]+e[8]*o[17],t[8]=e[5]*o[3]+e[6]*o[8]+e[7]*o[13]+e[8]*o[18],t[9]=e[5]*o[4]+e[6]*o[9]+e[7]*o[14]+e[8]*o[19]+e[9],t[10]=e[10]*o[0]+e[11]*o[5]+e[12]*o[10]+e[13]*o[15],t[11]=e[10]*o[1]+e[11]*o[6]+e[12]*o[11]+e[13]*o[16],t[12]=e[10]*o[2]+e[11]*o[7]+e[12]*o[12]+e[13]*o[17],t[13]=e[10]*o[3]+e[11]*o[8]+e[12]*o[13]+e[13]*o[18],t[14]=e[10]*o[4]+e[11]*o[9]+e[12]*o[14]+e[13]*o[19]+e[14],t[15]=e[15]*o[0]+e[16]*o[5]+e[17]*o[10]+e[18]*o[15],t[16]=e[15]*o[1]+e[16]*o[6]+e[17]*o[11]+e[18]*o[16],t[17]=e[15]*o[2]+e[16]*o[7]+e[17]*o[12]+e[18]*o[17],t[18]=e[15]*o[3]+e[16]*o[8]+e[17]*o[13]+e[18]*o[18],t[19]=e[15]*o[4]+e[16]*o[9]+e[17]*o[14]+e[18]*o[19]+e[19],t}brightness(t,e){const o=[t,0,0,0,0,0,t,0,0,0,0,0,t,0,0,0,0,0,1,0];this._loadMatrix(o,e)}tint(t,e){const[o,n,i]=P.shared.setValue(t).toArray(),r=[o,0,0,0,0,0,n,0,0,0,0,0,i,0,0,0,0,0,1,0];this._loadMatrix(r,e)}greyscale(t,e){const o=[t,t,t,0,0,t,t,t,0,0,t,t,t,0,0,0,0,0,1,0];this._loadMatrix(o,e)}grayscale(t,e){this.greyscale(t,e)}blackAndWhite(t){const e=[.3,.6,.1,0,0,.3,.6,.1,0,0,.3,.6,.1,0,0,0,0,0,1,0];this._loadMatrix(e,t)}hue(t,e){t=(t||0)/180*Math.PI;const o=Math.cos(t),n=Math.sin(t),i=Math.sqrt,r=1/3,s=i(r),u=o+(1-o)*r,a=r*(1-o)-s*n,l=r*(1-o)+s*n,d=r*(1-o)+s*n,c=o+r*(1-o),g=r*(1-o)-s*n,x=r*(1-o)-s*n,w=r*(1-o)+s*n,y=o+r*(1-o),O=[u,a,l,0,0,d,c,g,0,0,x,w,y,0,0,0,0,0,1,0];this._loadMatrix(O,e)}contrast(t,e){const o=(t||0)+1,n=-.5*(o-1),i=[o,0,0,0,n,0,o,0,0,n,0,0,o,0,n,0,0,0,1,0];this._loadMatrix(i,e)}saturate(t=0,e){const o=t*2/3+1,n=(o-1)*-.5,i=[o,n,n,0,0,n,o,n,0,0,n,n,o,0,0,0,0,0,1,0];this._loadMatrix(i,e)}desaturate(){this.saturate(-1)}negative(t){const e=[-1,0,0,1,0,0,-1,0,1,0,0,0,-1,1,0,0,0,0,1,0];this._loadMatrix(e,t)}sepia(t){const e=[.393,.7689999,.18899999,0,0,.349,.6859999,.16799999,0,0,.272,.5339999,.13099999,0,0,0,0,0,1,0];this._loadMatrix(e,t)}technicolor(t){const e=[1.9125277891456083,-.8545344976951645,-.09155508482755585,0,.046249425232852304,-.3087833385928097,1.7658908555458428,-.10601743074722245,0,-.2758903984886823,-.231103377548616,-.7501899197440212,1.847597816108189,0,.12137623870388682,0,0,0,1,0];this._loadMatrix(e,t)}polaroid(t){const e=[1.438,-.062,-.062,0,0,-.122,1.378,-.122,0,0,-.016,-.016,1.483,0,0,0,0,0,1,0];this._loadMatrix(e,t)}toBGR(t){const e=[0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0];this._loadMatrix(e,t)}kodachrome(t){const e=[1.1285582396593525,-.3967382283601348,-.03992559172921793,0,.24991995145868634,-.16404339962244616,1.0835251566291304,-.05498805115633132,0,.09698983488904393,-.16786010706155763,-.5603416277695248,1.6014850761964943,0,.13972481597886063,0,0,0,1,0];this._loadMatrix(e,t)}browni(t){const e=[.5997023498159715,.34553243048391263,-.2708298674538042,0,.1860075629647401,-.037703249837783157,.8609577587992641,.15059552388459913,0,-.14497417640467167,.24113635128153335,-.07441037908422492,.44972182064877153,0,-.029655197167024642,0,0,0,1,0];this._loadMatrix(e,t)}vintage(t){const e=[.6279345635605994,.3202183420819367,-.03965408211312453,0,.037848179746251466,.02578397704808868,.6441188644374771,.03259127616149294,0,.029265996770472907,.0466055556782719,-.0851232987247891,.5241648018700465,0,.020232119953863904,0,0,0,1,0];this._loadMatrix(e,t)}colorTone(t,e,o,n,i){t||(t=.2),e||(e=.15),o||(o=16770432),n||(n=3375104);const r=P.shared,[s,u,a]=r.setValue(o).toArray(),[l,d,c]=r.setValue(n).toArray(),g=[.3,.59,.11,0,0,s,u,a,t,0,l,d,c,e,0,s-l,u-d,a-c,0,0];this._loadMatrix(g,i)}night(t,e){t||(t=.1);const o=[t*-2,-t,0,0,0,-t,0,t,0,0,0,t,t*2,0,0,0,0,0,1,0];this._loadMatrix(o,e)}predator(t,e){const o=[11.224130630493164*t,-4.794486999511719*t,-2.8746118545532227*t,0*t,.40342438220977783*t,-3.6330697536468506*t,9.193157196044922*t,-2.951810836791992*t,0*t,-1.316135048866272*t,-3.2184197902679443*t,-4.2375030517578125*t,7.476448059082031*t,0*t,.8044459223747253*t,0,0,0,1,0];this._loadMatrix(o,e)}lsd(t){const e=[2,-.4,.5,0,0,-.5,2,-.4,0,0,-.4,-.5,3,0,0,0,0,0,1,0];this._loadMatrix(e,t)}reset(){const t=[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];this._loadMatrix(t,!1)}get matrix(){return this.resources.colorMatrixUniforms.uniforms.uColorMatrix}set matrix(t){this.resources.colorMatrixUniforms.uniforms.uColorMatrix=t}get alpha(){return this.resources.colorMatrixUniforms.uniforms.uAlpha}set alpha(t){this.resources.colorMatrixUniforms.uniforms.uAlpha=t}}const it={voltkin:{name:"VOLTKIN",power:"The storm given a body.",recipe:"Chain 4 Squares, then 4 Triangles — 8 bonded in one straight line, both ends free. The sky answers with a summons.",sprite:"/godly/voltkin/anim/voltkin-zap.png"},nonet:{name:"NONET",power:"One trial. Double or nothing.",recipe:"Bond 9 of ONE shape — nothing else. A Sudoku trial freezes the duel: solve it first and your score DOUBLES; every rival is HALVED.",sprite:"/art/nonet/kami.webp"},pentagram:{name:"PENTAGRAM",power:"A ring that births the swarm.",recipe:"Bond 5 Triangles into a closed ring — each touching exactly two. It mints chewers that gnaw through enemy bonds.",emblem:{kind:"ring",nodes:5,nodeType:b.Triangle,radius:44}},lightningHub:{name:"LIGHTNING HUB",power:"It gives its life in lightning.",recipe:"Bond 5 Circles to 1 central Dot — a six-shape star. It fires 3 lightning drones at enemy connectors, then detonates in a storm.",emblem:{kind:"star",hubType:b.Dot,nodes:5,nodeType:b.Circle,radius:40}},laserTurret:{name:"LASER TURRET",power:"Eight shapes. One judgment beam.",recipe:"Bond 7 Spirals to 1 Line — all seven on the same rod. Its beam turns enemy chewers to ash. (Seven. Not four.)",emblem:{kind:"star",hubType:b.Line,nodes:7,nodeType:b.Spiral,radius:46}},helga:{name:"HELGA",power:"The princess answers in slaps.",recipe:"Bond 3 Spirals + 3 Circles to 1 Triangle hub — seven shapes. HELGA descends and slaps chewers off your walls.",sprite:"/godly/helga/helga.png"}};function D(h){return it[h]??{name:h.toUpperCase(),power:"",recipe:"???"}}function st(h){const t=[];for(let n=0;n<h.nodes;n++){const i=-Math.PI/2+n*2*Math.PI/h.nodes;t.push({type:h.nodeType,x:Math.cos(i)*h.radius,y:Math.sin(i)*h.radius})}const e=[];if(h.kind==="ring"){for(let n=0;n<t.length;n++){const i=t[(n+1)%t.length];e.push({x1:t[n].x,y1:t[n].y,x2:i.x,y2:i.y})}return{nodes:t,bonds:e}}const o=h.hubType??b.Dot;for(const n of t)e.push({x1:0,y1:0,x2:n.x,y2:n.y});return{hub:{type:o,x:0,y:0},nodes:t,bonds:e}}const at=8949928,R=5460842;function lt(h,t,e){const o=st(t),n=e?.75:.35;for(const r of o.bonds)h.moveTo(r.x1,r.y1).lineTo(r.x2,r.y2).stroke({width:2,color:e?at:R,alpha:n});const i=(r,s,u)=>{const a=new v;H[r](a),a.tint=e?N[r]:R,a.alpha=e?1:.55,a.position.set(s,u),h.addChild(a)};o.hub!==void 0&&i(o.hub.type,o.hub.x,o.hub.y);for(const r of o.nodes)i(r.type,r.x,r.y)}const S=16766474,z=3816004,ct=5460842,p=240,E=320,G=28,W=235,V=116,I=200,U=226,A=5;function dt(h){const t=D(h.id);return{id:h.id,displayName:t.name,power:t.power,recipeHint:t.recipe,characterSprite:t.sprite,emblem:t.emblem}}function pt(){const h=D("nonet");return{id:"nonet",displayName:h.name,power:h.power,recipeHint:h.recipe,characterSprite:h.sprite,emblem:h.emblem}}const T=[{key:"godly",label:"GODLY COMBOS",color:16739029,subtitle:"cinematic summons — earned in the arena, never given"},{key:"combos",label:"COMBOS",color:5495039,subtitle:"the geometry itself — two shapes, one magic"},{key:"towers",label:"TOWERS & STRUCTURES",color:S,subtitle:"build them true and they fight for you"}];class mt{container;app;godly;towers;active="godly";content;subtitle;tabButtons=new Map;avatarLayer=null;savedAvatarIndex=-1;constructor(t,e,o){this.app=t,this.godly=e.godly,this.towers=e.towers,this.container=new M;const n=new v;n.rect(0,0,C,L).fill({color:0,alpha:.93}),this.container.addChild(n);const i=new m({text:"CODEX",style:new f({fontFamily:"monospace",fontSize:48,fill:16777215,letterSpacing:12})});i.anchor.set(.5),i.position.set(C/2,70),this.container.addChild(i),this.subtitle=new m({text:"",style:new f({fontFamily:"monospace",fontSize:15,fill:11184810,letterSpacing:1})}),this.subtitle.anchor.set(.5),this.subtitle.position.set(C/2,192),this.container.addChild(this.subtitle);const r=new m({text:"entries reveal through play · press G+C in-game to open the codex",style:new f({fontFamily:"monospace",fontSize:13,fill:6974072,letterSpacing:1})});r.anchor.set(.5),r.position.set(C/2,L-26),this.container.addChild(r);const s=130,u=320,a=16,l=T.length*u+(T.length-1)*a;let d=(C-l)/2;for(const w of T){const y=new M,O=new v;y.addChild(O);const _=new m({text:w.label,style:new f({fontFamily:"monospace",fontSize:18,fill:16777215,letterSpacing:2,fontWeight:"bold"})});_.anchor.set(.5),_.position.set(u/2,24),y.addChild(_),y.position.set(d,s),y.eventMode="static",y.cursor="pointer",y.on("pointertap",()=>this.switchTab(w.key)),this.container.addChild(y),this.tabButtons.set(w.key,{box:O,label:_}),d+=u+a}this.tabW=u;const c=new M,g=new v;g.roundRect(0,0,100,36,6).fill({color:2236962,alpha:.9}).stroke({width:2,color:8947848,alpha:.8}),c.addChild(g);const x=new m({text:"CLOSE",style:new f({fontFamily:"monospace",fontSize:14,fill:13421772,letterSpacing:2})});x.anchor.set(.5),x.position.set(50,18),c.addChild(x),c.position.set(C-130,30),c.eventMode="static",c.cursor="pointer",c.on("pointertap",o),this.container.addChild(c),this.content=new M,this.container.addChild(this.content),this.container.visible=!1,t.stage.addChild(this.container)}tabW=320;setAvatarLayer(t){this.avatarLayer=t}setVisible(t){if(t)this.app.stage.addChild(this.container),this.rebuild(),this.avatarLayer!==null&&this.avatarLayer.parent===this.app.stage&&(this.savedAvatarIndex=this.app.stage.getChildIndex(this.avatarLayer),this.app.stage.addChild(this.avatarLayer));else if(this.avatarLayer!==null&&this.savedAvatarIndex>=0&&this.avatarLayer.parent===this.app.stage){const e=Math.min(this.savedAvatarIndex,this.app.stage.children.length-1);this.app.stage.setChildIndex(this.avatarLayer,e),this.savedAvatarIndex=-1}this.container.visible=t}isVisible(){return this.container.visible}open(t="godly"){this.active=t,this.setVisible(!0)}switchTab(t){this.active!==t&&(this.active=t,this.rebuild())}rebuild(){this.drawTabBar(),this.subtitle.text=T.find(t=>t.key===this.active)?.subtitle??"",this.content.removeChildren().forEach(t=>t.destroy({children:!0})),this.active==="godly"?this.buildSpriteGrid(this.godly,k()):this.active==="towers"?this.buildSpriteGrid(this.towers,k()):this.buildCombosGrid()}drawTabBar(){for(const t of T){const e=this.tabButtons.get(t.key);if(e===void 0)continue;const o=t.key===this.active;e.box.clear(),e.box.roundRect(0,0,this.tabW,48,8).fill({color:o?t.color:1315866,alpha:o?.9:.85}).stroke({width:2,color:o?16777215:t.color,alpha:o?.95:.55}),e.label.style.fill=o?1052692:t.color}}buildSpriteGrid(t,e){if(t.length===0){const r=new m({text:"nothing discovered yet — play to reveal",style:new f({fontFamily:"monospace",fontSize:16,fill:6710886})});r.anchor.set(.5),r.position.set(C/2,L/2),this.content.addChild(r);return}const o=Math.min(t.length,4),n=o*p+(o-1)*G,i=(C-n)/2;for(let r=0;r<t.length;r++){const s=t[r],u=r%o,a=Math.floor(r/o),l=i+u*(p+G),d=W+a*(E+G);this.content.addChild(this.makeSpriteTile(s,e.has(s.id),l,d))}}makeSpriteTile(t,e,o,n){const i=new M;i.position.set(o,n);const r=new v;r.roundRect(0,0,p,E,12).fill({color:657930,alpha:.85}).stroke({width:2,color:e?S:z,alpha:.7}),i.addChild(r);const s=new m({text:e?t.displayName:"???",style:new f({fontFamily:"monospace",fontSize:20,fill:e?S:6710886,letterSpacing:2,fontWeight:"bold"})});if(s.anchor.set(.5),s.position.set(p/2,30),B(s,p-24,12),i.addChild(s),t.emblem!==void 0){const l=new v;lt(l,t.emblem,e),l.position.set(p/2,V),i.addChild(l)}else if(t.characterSprite!==void 0){const l=t.characterSprite;$.load(l).then(d=>{const c=new j(d);c.anchor.set(.5),c.position.set(p/2,V);const g=Math.min(150/d.width,130/d.height);if(c.scale.set(Math.min(.26,g)),!e){const x=new rt;x.desaturate(),c.filters=[x],c.alpha=.15}i.addChild(c)}).catch(()=>{})}if(e&&t.power!==""){const l=new m({text:t.power,style:new f({fontFamily:"monospace",fontSize:13,fill:15260064,letterSpacing:1,align:"center"})});l.anchor.set(.5),l.position.set(p/2,I),B(l,p-20,10),i.addChild(l)}const u=new v;u.moveTo(20,I+16).lineTo(p-20,I+16).stroke({width:1,color:e?3814948:2236970,alpha:.9}),i.addChild(u);const a=new m({text:t.recipeHint,style:new f({fontFamily:"monospace",fontSize:12,fill:e?12566463:10132136,wordWrap:!0,wordWrapWidth:p-28,align:"center"})});return a.anchor.set(.5,0),a.position.set(p/2,U),J(a,p-28,E-U-12,9),i.addChild(a),i}buildCombosGrid(){const t=Q();this.subtitle.text=`COMBOS — ${t.size} / ${Z.length} discovered · connect two shapes in play to reveal`;const e=tt(),o=224,n=132,i=24,r=24;for(let s=0;s<e.length;s++){const u=e[s],a=Math.floor(s/A),l=s%A,d=Math.min(A,e.length-a*A),c=d*o+(d-1)*i,x=(C-c)/2+l*(o+i),w=W+a*(n+r);this.content.addChild(this.makeComboTile(u,t.has(u.key),x,w,o,n))}}makeComboTile(t,e,o,n,i,r){const s=new M;s.position.set(o,n);const u=new v;u.roundRect(0,0,i,r,12).fill({color:657930,alpha:.85}).stroke({width:2,color:e?S:z,alpha:.75}),s.addChild(u);const a=new m({text:e?t.outcome.resultName:"???",style:new f({fontFamily:"monospace",fontSize:19,fill:e?S:6710886,letterSpacing:2,fontWeight:"bold"})});a.anchor.set(.5),a.position.set(i/2,36),s.addChild(a);const l=88;s.addChild(this.makeGlyph(t.a,i/2-46,l,e));const d=new m({text:et(t.a,t.b)?"↔":"→",style:new f({fontFamily:"monospace",fontSize:22,fill:e?14540253:5592405})});if(d.anchor.set(.5),d.position.set(i/2,l),s.addChild(d),s.addChild(this.makeGlyph(t.b,i/2+46,l,e)),!e){const c=new m({text:"connect to reveal",style:new f({fontFamily:"monospace",fontSize:11,fill:5592405})});c.anchor.set(.5),c.position.set(i/2,r-16),s.addChild(c)}return s}makeGlyph(t,e,o,n){const i=new M;i.position.set(e,o);const r=new v;return H[t](r),r.tint=n?N[t]:ct,n||(r.alpha=.5),i.addChild(r),i}}export{mt as CodexOverlay,dt as entryFromRecipe,pt as nonetEntry,gt as unlockGodly};
//# sourceMappingURL=codexOverlay-zsFnTmII.js.map
