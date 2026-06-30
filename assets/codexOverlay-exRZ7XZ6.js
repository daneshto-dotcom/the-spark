import{u as k,an as R,z as U,x as V,p as A,q as v,H as y,i as m,C as G,ab as p,ac as f,bb as F,c as W,a8 as B,ba as E,M as H,be as K,b5 as q,a0 as N,a1 as X}from"./index-BZSCuCtI.js";import{bw as nt}from"./index-BZSCuCtI.js";import{v as Y}from"./defaultFilter.vert-Dw338EcB.js";var D=`
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
`,P=`struct GlobalFilterUniforms {
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
}`;class $ extends k{constructor(o={}){const t=new R({uColorMatrix:{value:[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0],type:"f32",size:20},uAlpha:{value:1,type:"f32"}}),r=U.from({vertex:{source:P,entryPoint:"mainVertex"},fragment:{source:P,entryPoint:"mainFragment"}}),n=V.from({vertex:Y,fragment:D,name:"color-matrix-filter"});super({...o,gpuProgram:r,glProgram:n,resources:{colorMatrixUniforms:t}}),this.alpha=1}_loadMatrix(o,t=!1){if(t){const r=[...o];this._multiply(r,this.matrix,o),this.resources.colorMatrixUniforms.uniforms.uColorMatrix=r}else this.resources.colorMatrixUniforms.uniforms.uColorMatrix=o;this.resources.colorMatrixUniforms.update()}_multiply(o,t,r){return o[0]=t[0]*r[0]+t[1]*r[5]+t[2]*r[10]+t[3]*r[15],o[1]=t[0]*r[1]+t[1]*r[6]+t[2]*r[11]+t[3]*r[16],o[2]=t[0]*r[2]+t[1]*r[7]+t[2]*r[12]+t[3]*r[17],o[3]=t[0]*r[3]+t[1]*r[8]+t[2]*r[13]+t[3]*r[18],o[4]=t[0]*r[4]+t[1]*r[9]+t[2]*r[14]+t[3]*r[19]+t[4],o[5]=t[5]*r[0]+t[6]*r[5]+t[7]*r[10]+t[8]*r[15],o[6]=t[5]*r[1]+t[6]*r[6]+t[7]*r[11]+t[8]*r[16],o[7]=t[5]*r[2]+t[6]*r[7]+t[7]*r[12]+t[8]*r[17],o[8]=t[5]*r[3]+t[6]*r[8]+t[7]*r[13]+t[8]*r[18],o[9]=t[5]*r[4]+t[6]*r[9]+t[7]*r[14]+t[8]*r[19]+t[9],o[10]=t[10]*r[0]+t[11]*r[5]+t[12]*r[10]+t[13]*r[15],o[11]=t[10]*r[1]+t[11]*r[6]+t[12]*r[11]+t[13]*r[16],o[12]=t[10]*r[2]+t[11]*r[7]+t[12]*r[12]+t[13]*r[17],o[13]=t[10]*r[3]+t[11]*r[8]+t[12]*r[13]+t[13]*r[18],o[14]=t[10]*r[4]+t[11]*r[9]+t[12]*r[14]+t[13]*r[19]+t[14],o[15]=t[15]*r[0]+t[16]*r[5]+t[17]*r[10]+t[18]*r[15],o[16]=t[15]*r[1]+t[16]*r[6]+t[17]*r[11]+t[18]*r[16],o[17]=t[15]*r[2]+t[16]*r[7]+t[17]*r[12]+t[18]*r[17],o[18]=t[15]*r[3]+t[16]*r[8]+t[17]*r[13]+t[18]*r[18],o[19]=t[15]*r[4]+t[16]*r[9]+t[17]*r[14]+t[18]*r[19]+t[19],o}brightness(o,t){const r=[o,0,0,0,0,0,o,0,0,0,0,0,o,0,0,0,0,0,1,0];this._loadMatrix(r,t)}tint(o,t){const[r,n,i]=A.shared.setValue(o).toArray(),e=[r,0,0,0,0,0,n,0,0,0,0,0,i,0,0,0,0,0,1,0];this._loadMatrix(e,t)}greyscale(o,t){const r=[o,o,o,0,0,o,o,o,0,0,o,o,o,0,0,0,0,0,1,0];this._loadMatrix(r,t)}grayscale(o,t){this.greyscale(o,t)}blackAndWhite(o){const t=[.3,.6,.1,0,0,.3,.6,.1,0,0,.3,.6,.1,0,0,0,0,0,1,0];this._loadMatrix(t,o)}hue(o,t){o=(o||0)/180*Math.PI;const r=Math.cos(o),n=Math.sin(o),i=Math.sqrt,e=1/3,s=i(e),c=r+(1-r)*e,u=e*(1-r)-s*n,l=e*(1-r)+s*n,a=e*(1-r)+s*n,h=r+e*(1-r),x=e*(1-r)-s*n,g=e*(1-r)-s*n,d=e*(1-r)+s*n,b=r+e*(1-r),M=[c,u,l,0,0,a,h,x,0,0,g,d,b,0,0,0,0,0,1,0];this._loadMatrix(M,t)}contrast(o,t){const r=(o||0)+1,n=-.5*(r-1),i=[r,0,0,0,n,0,r,0,0,n,0,0,r,0,n,0,0,0,1,0];this._loadMatrix(i,t)}saturate(o=0,t){const r=o*2/3+1,n=(r-1)*-.5,i=[r,n,n,0,0,n,r,n,0,0,n,n,r,0,0,0,0,0,1,0];this._loadMatrix(i,t)}desaturate(){this.saturate(-1)}negative(o){const t=[-1,0,0,1,0,0,-1,0,1,0,0,0,-1,1,0,0,0,0,1,0];this._loadMatrix(t,o)}sepia(o){const t=[.393,.7689999,.18899999,0,0,.349,.6859999,.16799999,0,0,.272,.5339999,.13099999,0,0,0,0,0,1,0];this._loadMatrix(t,o)}technicolor(o){const t=[1.9125277891456083,-.8545344976951645,-.09155508482755585,0,.046249425232852304,-.3087833385928097,1.7658908555458428,-.10601743074722245,0,-.2758903984886823,-.231103377548616,-.7501899197440212,1.847597816108189,0,.12137623870388682,0,0,0,1,0];this._loadMatrix(t,o)}polaroid(o){const t=[1.438,-.062,-.062,0,0,-.122,1.378,-.122,0,0,-.016,-.016,1.483,0,0,0,0,0,1,0];this._loadMatrix(t,o)}toBGR(o){const t=[0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0];this._loadMatrix(t,o)}kodachrome(o){const t=[1.1285582396593525,-.3967382283601348,-.03992559172921793,0,.24991995145868634,-.16404339962244616,1.0835251566291304,-.05498805115633132,0,.09698983488904393,-.16786010706155763,-.5603416277695248,1.6014850761964943,0,.13972481597886063,0,0,0,1,0];this._loadMatrix(t,o)}browni(o){const t=[.5997023498159715,.34553243048391263,-.2708298674538042,0,.1860075629647401,-.037703249837783157,.8609577587992641,.15059552388459913,0,-.14497417640467167,.24113635128153335,-.07441037908422492,.44972182064877153,0,-.029655197167024642,0,0,0,1,0];this._loadMatrix(t,o)}vintage(o){const t=[.6279345635605994,.3202183420819367,-.03965408211312453,0,.037848179746251466,.02578397704808868,.6441188644374771,.03259127616149294,0,.029265996770472907,.0466055556782719,-.0851232987247891,.5241648018700465,0,.020232119953863904,0,0,0,1,0];this._loadMatrix(t,o)}colorTone(o,t,r,n,i){o||(o=.2),t||(t=.15),r||(r=16770432),n||(n=3375104);const e=A.shared,[s,c,u]=e.setValue(r).toArray(),[l,a,h]=e.setValue(n).toArray(),x=[.3,.59,.11,0,0,s,c,u,o,0,l,a,h,t,0,s-l,c-a,u-h,0,0];this._loadMatrix(x,i)}night(o,t){o||(o=.1);const r=[o*-2,-o,0,0,0,-o,0,o,0,0,0,o,o*2,0,0,0,0,0,1,0];this._loadMatrix(r,t)}predator(o,t){const r=[11.224130630493164*o,-4.794486999511719*o,-2.8746118545532227*o,0*o,.40342438220977783*o,-3.6330697536468506*o,9.193157196044922*o,-2.951810836791992*o,0*o,-1.316135048866272*o,-3.2184197902679443*o,-4.2375030517578125*o,7.476448059082031*o,0*o,.8044459223747253*o,0,0,0,1,0];this._loadMatrix(r,t)}lsd(o){const t=[2,-.4,.5,0,0,-.5,2,-.4,0,0,-.4,-.5,3,0,0,0,0,0,1,0];this._loadMatrix(t,o)}reset(){const o=[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];this._loadMatrix(o,!1)}get matrix(){return this.resources.colorMatrixUniforms.uniforms.uColorMatrix}set matrix(o){this.resources.colorMatrixUniforms.uniforms.uColorMatrix=o}get alpha(){return this.resources.colorMatrixUniforms.uniforms.uAlpha}set alpha(o){this.resources.colorMatrixUniforms.uniforms.uAlpha=o}}const S=16766474,L=3816004,j=5460842,C=220,z=230,T=28,I=250,O=5;function Z(_,o,t){return{id:_.id,displayName:o,recipeHint:t,characterSprite:_.characterSprite}}const w=[{key:"godly",label:"GODLY COMBOS",color:16739029,subtitle:"cinematic summons — discovered through play"},{key:"combos",label:"COMBOS",color:5495039,subtitle:"the geometry — two shapes, one magic"},{key:"towers",label:"TOWERS & STRUCTURES",color:S,subtitle:"buildables that come alive on the field"}];class tt{container;app;godly;towers;active="godly";content;subtitle;tabButtons=new Map;avatarLayer=null;savedAvatarIndex=-1;constructor(o,t,r){this.app=o,this.godly=t.godly,this.towers=t.towers,this.container=new v;const n=new y;n.rect(0,0,m,G).fill({color:0,alpha:.93}),this.container.addChild(n);const i=new p({text:"CODEX",style:new f({fontFamily:"monospace",fontSize:48,fill:16777215,letterSpacing:12})});i.anchor.set(.5),i.position.set(m/2,70),this.container.addChild(i),this.subtitle=new p({text:"",style:new f({fontFamily:"monospace",fontSize:15,fill:11184810,letterSpacing:1})}),this.subtitle.anchor.set(.5),this.subtitle.position.set(m/2,192),this.container.addChild(this.subtitle);const e=130,s=320,c=16,u=w.length*s+(w.length-1)*c;let l=(m-u)/2;for(const g of w){const d=new v,b=new y;d.addChild(b);const M=new p({text:g.label,style:new f({fontFamily:"monospace",fontSize:18,fill:16777215,letterSpacing:2,fontWeight:"bold"})});M.anchor.set(.5),M.position.set(s/2,24),d.addChild(M),d.position.set(l,e),d.eventMode="static",d.cursor="pointer",d.on("pointertap",()=>this.switchTab(g.key)),this.container.addChild(d),this.tabButtons.set(g.key,{box:b,label:M}),l+=s+c}this.tabW=s;const a=new v,h=new y;h.roundRect(0,0,100,36,6).fill({color:2236962,alpha:.9}).stroke({width:2,color:8947848,alpha:.8}),a.addChild(h);const x=new p({text:"CLOSE",style:new f({fontFamily:"monospace",fontSize:14,fill:13421772,letterSpacing:2})});x.anchor.set(.5),x.position.set(50,18),a.addChild(x),a.position.set(m-130,30),a.eventMode="static",a.cursor="pointer",a.on("pointertap",r),this.container.addChild(a),this.content=new v,this.container.addChild(this.content),this.container.visible=!1,o.stage.addChild(this.container)}tabW=320;setAvatarLayer(o){this.avatarLayer=o}setVisible(o){if(o)this.app.stage.addChild(this.container),this.rebuild(),this.avatarLayer!==null&&this.avatarLayer.parent===this.app.stage&&(this.savedAvatarIndex=this.app.stage.getChildIndex(this.avatarLayer),this.app.stage.addChild(this.avatarLayer));else if(this.avatarLayer!==null&&this.savedAvatarIndex>=0&&this.avatarLayer.parent===this.app.stage){const t=Math.min(this.savedAvatarIndex,this.app.stage.children.length-1);this.app.stage.setChildIndex(this.avatarLayer,t),this.savedAvatarIndex=-1}this.container.visible=o}isVisible(){return this.container.visible}open(o="godly"){this.active=o,this.setVisible(!0)}switchTab(o){this.active!==o&&(this.active=o,this.rebuild())}rebuild(){this.drawTabBar(),this.subtitle.text=w.find(o=>o.key===this.active)?.subtitle??"",this.content.removeChildren().forEach(o=>o.destroy({children:!0})),this.active==="godly"?this.buildSpriteGrid(this.godly,F()):this.active==="towers"?this.buildSpriteGrid(this.towers,F()):this.buildCombosGrid()}drawTabBar(){for(const o of w){const t=this.tabButtons.get(o.key);if(t===void 0)continue;const r=o.key===this.active;t.box.clear(),t.box.roundRect(0,0,this.tabW,48,8).fill({color:r?o.color:1315866,alpha:r?.9:.85}).stroke({width:2,color:r?16777215:o.color,alpha:r?.95:.55}),t.label.style.fill=r?1052692:o.color}}buildSpriteGrid(o,t){if(o.length===0){const e=new p({text:"nothing discovered yet — play to reveal",style:new f({fontFamily:"monospace",fontSize:16,fill:6710886})});e.anchor.set(.5),e.position.set(m/2,G/2),this.content.addChild(e);return}const r=Math.min(o.length,4),n=r*C+(r-1)*T,i=(m-n)/2;for(let e=0;e<o.length;e++){const s=o[e],c=e%r,u=Math.floor(e/r),l=i+c*(C+T),a=I+u*(z+T);this.content.addChild(this.makeSpriteTile(s,t.has(s.id),l,a))}}makeSpriteTile(o,t,r,n){const i=new v;i.position.set(r,n);const e=new y;e.roundRect(0,0,C,z,12).fill({color:657930,alpha:.85}).stroke({width:2,color:t?S:L,alpha:.7}),i.addChild(e),W.load(o.characterSprite).then(u=>{const l=new B(u);if(l.anchor.set(.5),l.position.set(C/2,84),l.scale.set(.26),!t){const a=new $;a.desaturate(),l.filters=[a],l.alpha=.15}i.addChild(l)}).catch(()=>{});const s=new p({text:t?o.displayName:"???",style:new f({fontFamily:"monospace",fontSize:20,fill:t?S:6710886,letterSpacing:2})});s.anchor.set(.5),s.position.set(C/2,160),i.addChild(s);const c=new p({text:o.recipeHint,style:new f({fontFamily:"monospace",fontSize:12,fill:t?12566463:10132136,wordWrap:!0,wordWrapWidth:C-20,align:"center"})});return c.anchor.set(.5,0),c.position.set(C/2,178),i.addChild(c),i}buildCombosGrid(){const o=E();this.subtitle.text=`COMBOS — ${o.size} / ${H.length} discovered · connect two shapes in play to reveal`;const t=K(),r=224,n=132,i=24,e=24;for(let s=0;s<t.length;s++){const c=t[s],u=Math.floor(s/O),l=s%O,a=Math.min(O,t.length-u*O),h=a*r+(a-1)*i,g=(m-h)/2+l*(r+i),d=I+u*(n+e);this.content.addChild(this.makeComboTile(c,o.has(c.key),g,d,r,n))}}makeComboTile(o,t,r,n,i,e){const s=new v;s.position.set(r,n);const c=new y;c.roundRect(0,0,i,e,12).fill({color:657930,alpha:.85}).stroke({width:2,color:t?S:L,alpha:.75}),s.addChild(c);const u=new p({text:t?o.outcome.resultName:"???",style:new f({fontFamily:"monospace",fontSize:19,fill:t?S:6710886,letterSpacing:2,fontWeight:"bold"})});u.anchor.set(.5),u.position.set(i/2,36),s.addChild(u);const l=88;s.addChild(this.makeGlyph(o.a,i/2-46,l,t));const a=new p({text:q(o.a,o.b)?"↔":"→",style:new f({fontFamily:"monospace",fontSize:22,fill:t?14540253:5592405})});if(a.anchor.set(.5),a.position.set(i/2,l),s.addChild(a),s.addChild(this.makeGlyph(o.b,i/2+46,l,t)),!t){const h=new p({text:"connect to reveal",style:new f({fontFamily:"monospace",fontSize:11,fill:5592405})});h.anchor.set(.5),h.position.set(i/2,e-16),s.addChild(h)}return s}makeGlyph(o,t,r,n){const i=new v;i.position.set(t,r);const e=new y;return N[o](e),e.tint=n?X[o]:j,n||(e.alpha=.5),i.addChild(e),i}}export{tt as CodexOverlay,Z as entryFromRecipe,nt as unlockGodly};
//# sourceMappingURL=codexOverlay-exRZ7XZ6.js.map
