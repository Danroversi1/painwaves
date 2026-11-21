// Painwaves voice engine: one band-passed noise voice per person (or per group of particles).
// Silence: exact harmonics of one fundamental, very narrow bands, shared 10 Hz alpha tremolo -> consonance.
// Pain: partials detuned and stretched, bands widen into raw noise, envelopes re-attack -> dissonance.
class PainVoices extends AudioWorkletProcessor{
  constructor(){super();this.V=0;this.S=null;this.seed=22222;this.t=0;this.beatT=0;this.blk=0;this.gl=[0,0,0,0];this.gr=[0,0,0,0];
    this.aq=[];this.cutB=0;this.crash=0;this.dir=1;this.lastPh=null;this.clT=0;this.cl2=-1;this.fbA=0;this.fbP1=0;this.fbP2=0;this.port.onmessage=e=>{const d=e.data;if(d.voices)this.init(d.voices);if(d.state)this.S=d.state;if(d.acc)this.aq.push(d.acc);if(d.mod)this.mod=d.mod;if(d.wave)this.wq=(this.wq||[]).concat([d.wave])};}
  init(v){const n=v.h.length;this.V=n;this.h=Float32Array.from(v.h);this.pan=Float32Array.from(v.pan);this.det=Float32Array.from(v.det);this.vol=Float32Array.from(v.vol);
    this.lag=Float32Array.from(v.lag);this.drift=Float32Array.from(v.drift);this.delay=Float32Array.from(v.delay);this.ph=Float32Array.from(v.ph);
    this.env=new Float32Array(n);this.am=new Float32Array(n);this.mp=Float32Array.from(v.pan);this.ma=new Float32Array(n).fill(1);this.acc=new Float32Array(n);this.hx1=new Float32Array(n);this.hx2=new Float32Array(n);this.hy1=new Float32Array(n);this.hy2=new Float32Array(n);this.envPrev=new Float32Array(n);this.stage=new Uint8Array(n);this.wait=new Float32Array(n).fill(-1);
    this.x1=new Float32Array(n);this.x2=new Float32Array(n);this.y1=new Float32Array(n);this.y2=new Float32Array(n);this.out=new Float32Array(n);}
  rnd(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x;return(x>>>0)/4294967296}
  process(_,outputs){const L=outputs[0][0],R=outputs[0][1]||outputs[0][0],B=L.length,S=this.S,sr=sampleRate,dtb=B/sr;
    L.fill(0);if(R!==L)R.fill(0);if(!S||!this.V)return true;
    this.t+=dtb;const V=Math.min(this.V,S.voices||this.V);
    // beat: Pounder triggers every voice on a shared beat, delayed by its place in the scene
    let beatHit=false;if(S.beatOn){this.beatT+=dtb;if(this.beatT>=S.beat){this.beatT-=S.beat;beatHit=true}}
    // Striker: occasional clustered strikes on a random group of voices
    // Striker accents arrive with exact times: the high voices add a short sparkle of their own noise about two octaves up
    let strike=-1;if(S.cluster&&this.rnd()<S.rate*dtb*.15)strike=Math.floor(this.rnd()*8);
    const due=[];this.aq=this.aq.filter(q=>{if(q.at<currentTime+dtb){due.push(q);return false}return true});
    for(const q of due){for(let v=0;v<this.V;v++){if(this.h[v]*S.f0<1000||v%3!==q.g%3)continue;this.acc[v]=Math.max(this.acc[v],q.str)}this.cutB=Math.max(this.cutB,q.str)}
    this.cutB*=Math.exp(-dtb/.12);
    // Wave: data-driven hits (each pain peak sweeps across the stereo field), metal wheels on rails, high spray
    let sw=0,swPh=0;if(S.surf){swPh=S.swPh;sw=.5+.5*Math.sin(2*Math.PI*swPh);this.crash*=Math.exp(-dtb/.3);
      const wd=[];this.wq=(this.wq||[]).filter(q=>{if(q.at<currentTime+dtb){wd.push(q);return false}return true});
      for(const q of wd){this.crash=Math.max(this.crash,q.str*.8);const off=Math.max(0,q.at-currentTime);
        for(let v=0;v<this.V;v++){const pv=this.mod&&v<this.mod.pan.length?this.mp[v]:this.pan[v];this.wait[v]=off+(q.dir>0?(pv+1)/2:(1-pv)/2)*.35;if(this.h[v]*S.f0>=900)this.acc[v]=Math.max(this.acc[v],.9*S.pn*q.str)}}
      const clack=()=>{for(let v=0;v<this.V;v++){const hz=this.h[v]*S.f0;if(hz>=380&&hz<900&&this.rnd()<.5)this.am[v]=Math.max(this.am[v],.8*S.pn);else if(hz>=1100&&this.rnd()<.12)this.acc[v]=Math.max(this.acc[v],.3*S.pn)}};
      if(S.pn>.05){this.clT+=dtb;const per=.95-.45*S.pn;if(this.clT>=per){this.clT=0;clack();this.cl2=.11}if(this.cl2>=0){this.cl2-=dtb;if(this.cl2<0)clack()}}}
    const trem=1-S.trem*(.5+.5*Math.sin(2*Math.PI*10*this.t)); // alpha is synchronous: every voice shares this phase
    this.sw=(this.sw==null?1:this.sw)+((S.swellV==null?1:S.swellV)-(this.sw==null?1:this.sw))*Math.min(1,dtb/.15);
    const g=S.gain*12/Math.sqrt(V),M=S.modOn&&this.mod,km=Math.min(1,dtb/.06);
    for(let v=0;v<V;v++){
      // ---- envelope (block rate)
      let e=this.env[v],st=this.stage[v];const prev=e;
      if(beatHit&&S.pn>.02)this.wait[v]=this.delay[v]*S.beat*.5;
      if(this.wait[v]>=0){this.wait[v]-=dtb;if(this.wait[v]<0)st=1}
      if(!S.beatOn&&S.pn>.02){const rate=S.rate*(.5+this.vol[v]);if(strike>=0?(v%8===strike):this.rnd()<rate*dtb)st=1}
      const sT=S.sus*S.loud+S.silence; // sustain target: pain part + silence chord part
      if(st===1){e+=dtb/S.att;if(e>=1){e=1;st=2}}
      else if(st===2){const dec=S.dec*(.7+1.5*Math.max(0,this.lag[v]+.1));e-=(1-sT)*dtb/dec;if(e<=sT){e=sT;st=3}}
      else{const k=Math.min(1,dtb/S.rel);e+=(sT-e)*k}
      this.env[v]=e;this.stage[v]=st;
      // ---- frequency: harmonic -> stretched and detuned with pain
      const cents=this.det[v]*S.detune+this.drift[v]*S.driftC*Math.sin(this.t*.1+this.ph[v]);
      let f=S.f0*Math.pow(this.h[v],1+S.stretch)*Math.pow(2,cents/1200)*(S.surf?1+.012*Math.cos(2*Math.PI*swPh):1);if(f>sr*.45)f=sr*.45;
      const ac=this.acc[v];this.acc[v]*=Math.exp(-dtb/.12);const amv=this.am[v];this.am[v]*=Math.exp(-dtb/.09);const Q=S.surf?(amv>.02?S.Q+45*amv:S.Q/(1+5*this.crash)):(S.ring&&this.h[v]>=8?Math.max(S.Q,80):S.Q),w=2*Math.PI*f/sr,sn=Math.sin(w),cs=Math.cos(w),al=sn/(2*Q),a0=1+al;
      const b0=al/a0,a1=-2*cs/a0,a2=(1-al)/a0,comp=Math.sqrt(Q*100/f)*.6/Math.sqrt(Math.sqrt(this.h[v]));
      // shared alpha tremolo in silence; in pain each voice wobbles on its own (desynchronised)
      const own=1-S.wob*(.5+.5*Math.sin(2*Math.PI*(3+5*this.vol[v])*this.t+this.ph[v]));
      const sv=S.surf?(1+1.4*amv)*(1+.65*this.crash):1,a=g*comp*(S.trem>0?trem:1)*own*sv,ampA=prev*a,ampB=e*a,pv=M&&v<this.mod.pan.length?(this.mp[v]+=(this.mod.pan[v]-this.mp[v])*km):this.pan[v],mv=M&&v<this.mod.amp.length?(this.ma[v]+=(this.mod.amp[v]-this.ma[v])*km):1,pl=Math.cos((pv*.5+.5)*Math.PI/2)*(.4+.6*mv),pr=Math.sin((pv*.5+.5)*Math.PI/2)*(.4+.6*mv);
      // peak layer: the same noise, through a second band about two octaves above the voice (around 4-7 kHz)
      const hiOn=ac>.003,fh=Math.min(sr*.42,f*4),wh=2*Math.PI*fh/sr,alh=Math.sin(wh)/(2*14),a0h=1+alh,hb0=alh/a0h,ha1=-2*Math.cos(wh)/a0h,ha2=(1-alh)/a0h,
        ahA=g*Math.sqrt(14*100/fh)*.6*(ac*Math.exp(dtb/.12))*.13,ahB=g*Math.sqrt(14*100/fh)*.6*ac*.13;
      let hx1=this.hx1[v],hx2=this.hx2[v],hy1=this.hy1[v],hy2=this.hy2[v];
      let x1=this.x1[v],x2=this.x2[v],y1=this.y1[v],y2=this.y2[v],sd=this.seed;
      for(let i=0;i<B;i++){sd^=sd<<13;sd^=sd>>>17;sd^=sd<<5;const n=((sd>>>0)/2147483648)-1;
        const y=b0*n-b0*x2-a1*y1-a2*y2;x2=x1;x1=n;y2=y1;y1=y;let s=y*(ampA+(ampB-ampA)*i/B);
        if(hiOn){const hy=hb0*n-hb0*hx2-ha1*hy1-ha2*hy2;hx2=hx1;hx1=n;hy2=hy1;hy1=hy;s+=hy*(ahA+(ahB-ahA)*i/B)}
        L[i]+=s*pl;R[i]+=s*pr}
      this.hx1[v]=hx1;this.hx2[v]=hx2;this.hy1[v]=hy1;this.hy2[v]=hy2;
      this.seed=sd;this.x1[v]=x1;this.x2[v]=x2;this.y1[v]=y1;this.y2[v]=y2;this.out[v]=e}
    // ---- global resonant low-pass: cutoff follows neural loudness, resonance follows pain
    const w=2*Math.PI*Math.min(S.cut*(1+.4*this.cutB)*(S.surf?1+1.8*this.crash:1),sr*.45)/sr,sn=Math.sin(w),cs=Math.cos(w),al=sn/(2*S.Qg),a0=1+al,b1=(1-cs)/a0,b0=b1/2,a1=-2*cs/a0,a2=(1-al)/a0;
    let[lx1,lx2,ly1,ly2]=this.gl,[rx1,rx2,ry1,ry2]=this.gr;
    for(let i=0;i<B;i++){let x=L[i],y=b0*x+b1*lx1+b0*lx2-a1*ly1-a2*ly2;lx2=lx1;lx1=x;ly2=ly1;ly1=y;L[i]=Math.tanh(y*1.4)*.8;
      if(R!==L){x=R[i];y=b0*x+b1*rx1+b0*rx2-a1*ry1-a2*ry2;rx2=rx1;rx1=x;ry2=ry1;ry1=y;R[i]=Math.tanh(y*1.4)*.8}}
    this.gl=[lx1,lx2,ly1,ly2];this.gr=[rx1,rx2,ry1,ry2];
    // Striker feedback note: a faint, near-pure high tone that wavers like feedback, grows with pain and leans in at peaks
    const fbT=(S.fb||0)*(1+.6*this.cutB);if(fbT>0||this.fbA>1e-5){const fA=this.fbA,fB=fA+(fbT-fA)*Math.min(1,dtb/.8);this.fbA=fB;
      const vib=1+.0018*Math.sin(2*Math.PI*.23*this.t)+.0009*Math.sin(2*Math.PI*.71*this.t),w1=2*Math.PI*Math.min(sr*.45,S.fbF*vib)/sr,w2=w1*1.0011;
      for(let i=0;i<B;i++){this.fbP1+=w1;this.fbP2+=w2;const a=fA+(fB-fA)*i/B,s=(Math.sin(this.fbP1)+.35*Math.sin(this.fbP2))*a;L[i]+=s*.9;if(R!==L)R[i]+=s}
      this.fbP1%=2*Math.PI;this.fbP2%=2*Math.PI}
    if(++this.blk%6===0)this.port.postMessage({env:this.out.slice(0,V)});
    return true}
}
registerProcessor('pain-voices',PainVoices);
