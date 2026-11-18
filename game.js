import * as THREE from 'three';

'use strict';

// Original open-wheel racer. The handling is a simplified, speed-sensitive
// single-track vehicle model, not an engineering-accurate or licensed F1 sim.
(() => {
  const viewport = document.querySelector('#viewport');
  const menu = document.querySelector('#menu');
  const hud = document.querySelector('#hud');
  const message = document.querySelector('#message');
  const result = document.querySelector('#result');
  const touch = document.querySelector('#touch');
  const loading = document.querySelector('#loading');
  const input = { left:false, right:false, gas:false, brake:false, boost:false };
  const tracks = [
    { name:'Summit Park', sky:0x9acde5, ground:0x668d54, asphalt:0x303239, curb:0xf2eee6, phase:0.1, scale:1.0 },
    { name:'Red Mesa', sky:0xe9a276, ground:0xb8955e, asphalt:0x39363a, curb:0xf4ddbd, phase:1.45, scale:1.13 },
    { name:'Bluewater GP', sky:0x89c7dc, ground:0x589970, asphalt:0x30363b, curb:0xf3f0e5, phase:2.7, scale:0.83 }
  ];
  const carColors = [0x23b7ed,0xffbd3d,0xa27af2,0x68d88b,0xf2f0e9,0xf27638,0xe7659e,0x628ef3];
  const botNames = ['NOVA','APEX','MICA','KITE','RUSH','VOLT','JUNO','ACE'];
  const lapMeters = 4300;
  let renderer, scene, camera, trackCurve, trackLength=0, trackGroup, carsGroup, player, bots=[];
  let width=0,height=0,state='menu',track=tracks[0],distance=0,speed=0,lateral=0,lateralVelocity=0,headingError=0,boost=100,elapsed=0,countdown=3.5,lastTime=0,lapLimit=3,practice=false,frameId=0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const v=(x,y,z)=>new THREE.Vector3(x,y,z);
  function init(){
    try {
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
      renderer.setSize(viewport.clientWidth,viewport.clientHeight);
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
      viewport.appendChild(renderer.domElement);
      scene=new THREE.Scene();scene.background=new THREE.Color(0x9acde5);scene.fog=new THREE.Fog(0x9acde5,230,720);
      camera=new THREE.PerspectiveCamera(67,viewport.clientWidth/viewport.clientHeight,.1,1200);
      scene.add(new THREE.HemisphereLight(0xe4f3ff,0x526044,2.1));
      const sun=new THREE.DirectionalLight(0xfff0d7,3.0);sun.position.set(-80,120,40);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-120;sun.shadow.camera.right=120;sun.shadow.camera.top=120;sun.shadow.camera.bottom=-120;scene.add(sun);
      carsGroup=new THREE.Group();scene.add(carsGroup);
      resize();buildTrack(0);makePlayer();loading.classList.add('hidden');
      window.addEventListener('resize',resize);
      animate(performance.now());
    } catch (error) {
      loading.textContent='3D graphics could not start. Try a browser with WebGL enabled.';
      console.error(error);
    }
  }
  function resize(){if(!renderer)return;width=viewport.clientWidth;height=viewport.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}

  // Circuit is a closed, bank-free spline with straights, broad turns and a chicane.
  function circuitPoints(index){
    const k=tracks[index].scale;
    return [v(0,0,-154*k),v(100,0,-150*k),v(166,0,-108*k),v(178,0,-37*k),v(151,0,31*k),v(85,0,92*k),v(8,0,135*k),v(-80,0,125*k),v(-153,0,82*k),v(-174,0,16*k),v(-151,0,-51*k),v(-92,0,-115*k)];
  }
  function buildTrack(index){
    track=tracks[index];if(trackGroup){scene.remove(trackGroup);disposeGroup(trackGroup);}
    trackGroup=new THREE.Group();scene.add(trackGroup);
    trackCurve=new THREE.CatmullRomCurve3(circuitPoints(index),true,'catmullrom',.23);trackLength=trackCurve.getLength();
    scene.background.setHex(track.sky);scene.fog.color.setHex(track.sky);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(1300,1300),new THREE.MeshStandardMaterial({color:track.ground,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.35;ground.receiveShadow=true;trackGroup.add(ground);
    const n=720,half=7.5,verts=[],colors=[],indices=[];
    const cAsphalt=new THREE.Color(track.asphalt),c1=new THREE.Color(track.curb),c2=new THREE.Color(0xc73542);
    for(let i=0;i<=n;i++){
      const t=i/n,p=trackCurve.getPointAt(t),tan=trackCurve.getTangentAt(t).normalize(),right=v(-tan.z,0,tan.x).normalize();
      for(const q of [-1.22,-1.08,-1,-.94,0,.94,1,1.08,1.22]){
        const pos=p.clone().addScaledVector(right,q*half);pos.y=.02;verts.push(pos.x,pos.y,pos.z);
        let col=cAsphalt;if(Math.abs(q)>1.0001)col=((i>>2)%2)?c1:c2;else if(Math.abs(q)>.94)col=((i>>2)%2)?c2:c1;
        colors.push(col.r,col.g,col.b);
      }
    }
    const row=9;for(let i=0;i<n;i++)for(let j=0;j<row-1;j++){const a=i*row+j,b=a+row;indices.push(a,b,a+1,b,b+1,a+1);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
    const road=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide}));road.receiveShadow=true;trackGroup.add(road);
    // White edge lines and dashed center reference line.
    for(const side of [-.94,.94]){const points=[];for(let i=0;i<=240;i++){const p=trackCurve.getPointAt(i/240),t=trackCurve.getTangentAt(i/240).normalize();p.addScaledVector(v(-t.z,0,t.x).normalize(),side*half);p.y=.055;points.push(p);}const line=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),320,.075,4,true),new THREE.MeshStandardMaterial({color:0xf4f3ea,roughness:.8}));trackGroup.add(line);}
    const dashMat=new THREE.MeshStandardMaterial({color:0xd9d8ce,roughness:.8});for(let i=0;i<80;i++){const t=i/80,p=trackCurve.getPointAt(t),tan=trackCurve.getTangentAt(t).normalize();p.y=.065;const dash=new THREE.Mesh(new THREE.BoxGeometry(.13,.025,2.0),dashMat);dash.position.copy(p);dash.rotation.y=Math.atan2(-tan.x,-tan.z);trackGroup.add(dash);}
    makeScenery();
    // Starting gantry and grandstands near the start/finish line.
    const start=trackCurve.getPointAt(.015),tangent=trackCurve.getTangentAt(.015).normalize(),yaw=Math.atan2(-tangent.x,-tangent.z);
    const gantry=new THREE.Group();const beam=new THREE.Mesh(new THREE.BoxGeometry(15,.48,.5),new THREE.MeshStandardMaterial({color:0x25272c,metalness:.45,roughness:.4}));beam.position.y=8;gantry.add(beam);
    for(const x of [-7,7]){const post=new THREE.Mesh(new THREE.BoxGeometry(.45,8,.45),beam.material);post.position.set(x,4,0);gantry.add(post);}
    for(let i=0;i<5;i++){const lamp=new THREE.Mesh(new THREE.SphereGeometry(.38,12,8),new THREE.MeshBasicMaterial({color:0xff293a}));lamp.position.set(-4+i*2,7.6,-.3);gantry.add(lamp);}
    gantry.position.copy(start);gantry.position.y=0;gantry.rotation.y=yaw;trackGroup.add(gantry);
    const standMat=new THREE.MeshStandardMaterial({color:0x68717d,roughness:.85});for(const side of [-1,1]){const p=start.clone().addScaledVector(v(-tangent.z,0,tangent.x).normalize(),side*20);const stand=new THREE.Mesh(new THREE.BoxGeometry(32,5,8),standMat);stand.position.set(p.x,2.5,p.z);stand.rotation.y=yaw;trackGroup.add(stand);}
    // clear old opponent models when changing circuit from garage
    if(carsGroup){while(carsGroup.children.length>0){const child=carsGroup.children.pop();disposeGroup(child);}}
  }
  function makeScenery(){
    const treeMat=new THREE.MeshStandardMaterial({color:track.name==='Red Mesa'?0x567b39:0x286b48,roughness:1});
    const trunkMat=new THREE.MeshStandardMaterial({color:0x70553b,roughness:1});
    for(let i=0;i<190;i++){
      const t=(i*0.61803398875)%1,p=trackCurve.getPointAt(t),tan=trackCurve.getTangentAt(t).normalize(),right=v(-tan.z,0,tan.x).normalize(),side=i%2?1:-1;
      const away=12+(i%7)*3,base=p.addScaledVector(right,side*away);base.y=0;
      if(i%5===0){const box=new THREE.Mesh(new THREE.BoxGeometry(3,2,1.5),new THREE.MeshStandardMaterial({color:[0x1b8fa6,0xe0c638,0xe3e1d8,0xd94743][i%4],roughness:.75}));box.position.copy(base);box.position.y=1;box.lookAt(base.clone().add(tan));trackGroup.add(box);continue;}
      const size=1.3+(i%4)*.3;const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.13,.19,size,6),trunkMat);trunk.position.set(base.x,size/2,base.z);trackGroup.add(trunk);
      const crown=new THREE.Mesh(new THREE.ConeGeometry(size*.55,size*1.35,7),treeMat);crown.position.set(base.x,size*1.35,base.z);crown.castShadow=true;trackGroup.add(crown);
    }
    // pit buildings
    const pitMat=new THREE.MeshStandardMaterial({color:0xc9cbd0,roughness:.75});for(let i=0;i<7;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(10,4,5),pitMat);const p=trackCurve.getPointAt(.04+i*.008),tan=trackCurve.getTangentAt(.04).normalize(),right=v(-tan.z,0,tan.x).normalize();p.addScaledVector(right,11);b.position.set(p.x,2,p.z);b.rotation.y=Math.atan2(-tan.x,-tan.z);trackGroup.add(b);const door=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.7,.08),new THREE.MeshStandardMaterial({color:0x484e57}));door.position.set(0,-.8,2.55);b.add(door);}
  }
  function disposeGroup(group){group.traverse?.(obj=>{obj.geometry?.dispose();if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());else obj.material?.dispose();});}

  function makeCar(color,isPlayer=false,name=''){
    const root=new THREE.Group();root.userData={wheelMeshes:[],frontPivots:[]};
    const mat=(c,metal=0,rough=.42)=>new THREE.MeshStandardMaterial({color:c,metalness:metal,roughness:rough});
    const body=mat(color,.35,.27),carbon=mat(0x171a20,.22,.46),rubber=mat(0x111216,0,.92),rim=mat(0xaeb4bd,.72,.28),glass=mat(0x152b3b,.55,.18),white=mat(0xf4f1e8,.15,.38);
    function mesh(geo,material,x,y,z,parent=root){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
    // Driver is at +Y. Vehicle forward points along local -Z.
    mesh(new THREE.BoxGeometry(1.42,.25,3.05),body,0,.56,-.1);
    mesh(new THREE.BoxGeometry(1.72,.13,1.05),body,0,.48,-1.52);
    mesh(new THREE.BoxGeometry(1.8,.12,1.0),body,0,.5,1.43);
    // tapered monocoque nose and floor
    const nose=mesh(new THREE.ConeGeometry(.45,2.7,4),body,0,.58,-2.14);nose.rotation.x=-Math.PI/2;nose.rotation.z=Math.PI/4;
    mesh(new THREE.BoxGeometry(1.82,.15,3.8),carbon,0,.35,.02);
    // sidepods
    for(const side of [-1,1]){mesh(new THREE.BoxGeometry(.56,.48,1.8),body,side*.88,.56,.05);mesh(new THREE.BoxGeometry(.48,.2,.9),carbon,side*.88,.8,.2);}
    // cockpit tub, halo, seat
    mesh(new THREE.BoxGeometry(.73,.38,.95),carbon,0,.75,-.38);
    const cockpit=mesh(new THREE.SphereGeometry(.33,16,10),glass,0,.91,-.43);cockpit.scale.set(1,.72,1.45);
    mesh(new THREE.BoxGeometry(.1,.42,.1),carbon,0,1.12,-.83);
    const halo=mesh(new THREE.TorusGeometry(.35,.035,6,24,Math.PI),carbon,0,1.17,-.44);halo.rotation.z=Math.PI;
    // wings and endplates
    mesh(new THREE.BoxGeometry(2.35,.13,.42),carbon,0,.62,-3.1);
    for(const side of [-1,1])mesh(new THREE.BoxGeometry(.1,.34,.42),body,side*1.12,.8,-3.1);
    mesh(new THREE.BoxGeometry(2.15,.12,.52),carbon,0,1.02,2.17);
    for(const side of [-1,1]){mesh(new THREE.BoxGeometry(.12,.75,.45),body,side*1.03,1.0,2.18);mesh(new THREE.BoxGeometry(.16,.42,.14),carbon,side*.74,.91,2.6);}
    // suspension arms, four wheels, front steering pivots
    for(const x of [-.96,.96])for(const z of [-1.75,1.72]){
      const front=z<0,pivot=new THREE.Group();pivot.position.set(x,.43,z);root.add(pivot);
      const wheel=mesh(new THREE.CylinderGeometry(.37,.37,.22,20),rubber,0,0,0,pivot);wheel.rotation.z=Math.PI/2;root.userData.wheelMeshes.push(wheel);if(front)root.userData.frontPivots.push(pivot);
      const hub=mesh(new THREE.CylinderGeometry(.19,.19,.235,12),rim,0,0,0,pivot);hub.rotation.z=Math.PI/2;
      mesh(new THREE.BoxGeometry(.92,.055,.055),carbon,x*.58,.42,z*.72);
      const brake=mesh(new THREE.CylinderGeometry(.24,.24,.05,16),mat(0x6a6e75,.6,.35),x*1.01,.43,z);brake.rotation.z=Math.PI/2;
    }
    // tiny camera pod and driver helmet
    mesh(new THREE.BoxGeometry(.17,.14,.24),0x111319===color?carbon:carbon,0,1.23,.25);
    const helmet=mesh(new THREE.SphereGeometry(.2,12,10),mat(isPlayer?0xff3043:color,.2,.3),0,1.11,-.45);helmet.scale.set(.85,1,.9);
    root.userData.name=name;return root;
  }
  function makePlayer(){if(player){carsGroup.remove(player);disposeGroup(player);}player=makeCar(0xff3043,true,'YOU');carsGroup.add(player);}
  function placeOnTrack(object,progress,offset,y=0){const t=((progress%trackLength)+trackLength)%trackLength,p=trackCurve.getPointAt(t/trackLength),tan=trackCurve.getTangentAt(t/trackLength).normalize(),right=v(-tan.z,0,tan.x).normalize();p.addScaledVector(right,offset);p.y+=y;object.position.copy(p);object.rotation.y=Math.atan2(-tan.x,-tan.z);return {p,tan,right};}
  function startRace(isPractice){
    practice=isPractice;buildTrack(Number(document.querySelector('#track').value));lapLimit=Number(document.querySelector('#laps').value)||3;
    distance=0;speed=0;lateral=0;lateralVelocity=0;headingError=0;boost=100;elapsed=0;countdown=3.5;bots=[];
    if(!practice){const count=Number(document.querySelector('#rivals').value),difficulty=Number(document.querySelector('#difficulty').value);for(let i=0;i<count;i++){const bot={progress:-(i+1)*16,speed:(45+Math.random()*9)*difficulty,lane:(i%2? -2.25:2.25),phase:Math.random()*6.28,name:botNames[i],root:makeCar(carColors[i],false,botNames[i])};bots.push(bot);carsGroup.add(bot.root);}}
    player.visible=true;menu.hidden=true;hud.classList.add('visible');touch.classList.add('visible');result.hidden=true;state='countdown';message.textContent='3';message.classList.add('visible');updateHud();lastTime=performance.now();cancelAnimationFrame(frameId);frameId=requestAnimationFrame(animate);
  }
  function backToGarage(){state='menu';menu.hidden=false;hud.classList.remove('visible');touch.classList.remove('visible');result.hidden=true;message.classList.remove('visible');speed=0;bots.forEach(b=>{carsGroup.remove(b.root);disposeGroup(b.root);});bots=[];buildTrack(Number(document.querySelector('#track').value));render();refreshBest();}
  function formatTime(s){return `${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4,'0')}`;}
  function recordKey(){return `slipstream-3d-${track.name}-${lapLimit}`;}
  function bestTime(){try{return JSON.parse(localStorage.getItem(recordKey()));}catch(_){return null;}}
  function refreshBest(){track=tracks[Number(document.querySelector('#track').value)]||tracks[0];const r=bestTime();document.querySelector('#best').textContent=r?`Best ${track.name} (${lapLimit} laps): ${formatTime(r.time)} — ${r.name}`:'Best time: no record yet';}
  function updateHud(){document.querySelector('#speed').textContent=String(Math.round(Math.abs(speed)*3.6));const lap=Math.min(lapLimit,Math.floor(distance/lapMeters)+1);document.querySelector('#lap').textContent=practice?'—':`${lap} / ${lapLimit}`;let place=1+bots.filter(b=>b.progress>distance).length;document.querySelector('#place').textContent=`${place} / ${bots.length+1}`;document.querySelector('#time').textContent=formatTime(elapsed);document.querySelector('#boostText').textContent=`${Math.round(boost)}%`;document.querySelector('#boostFill').style.width=`${boost}%`;}
  function updatePhysics(dt){
    if(state==='countdown'){countdown-=dt;if(countdown>0)message.textContent=String(Math.ceil(countdown));else{state='race';message.textContent='GO!';setTimeout(()=>{if(state==='race')message.classList.remove('visible');},700);}}
    if(state!=='race')return;elapsed+=dt;
    const throttle=input.gas?1:0,brake=input.brake?1:0,boosting=input.boost&&boost>0&&speed>15;
    // Approximate open-wheel dynamics: acceleration, drag, braking and speed-limited grip.
    const drag=.012*speed*Math.abs(speed)+.32*speed;
    speed+=(throttle*11.5-brake*(speed>1?23:9)-drag+(boosting?3.5:0))*dt;
    speed=clamp(speed,-18,91.7);if(boosting)boost=Math.max(0,boost-27*dt);else boost=Math.min(100,boost+8*dt);
    const steer=(input.right?1:0)-(input.left?1:0),steerInput=steer*Math.max(0,1-Math.max(0,speed-42)/85);
    const wheelbase=3.65,maxSteer=.43,desiredYaw=speed/wheelbase*Math.tan(steerInput*maxSteer);
    const curveAhead=trackCurve.getTangentAt((((distance+3)%trackLength)+trackLength)%trackLength/trackLength),curveNow=trackCurve.getTangentAt((((distance)%trackLength)+trackLength)%trackLength);
    const curvature=Math.atan2(curveNow.x*curveAhead.z-curveNow.z*curveAhead.x,curveNow.x*curveAhead.x+curveNow.z*curveAhead.z)/3;
    const yawRate=desiredYaw-curvature*speed;
    headingError+=yawRate*dt;
    const lateralAccel=speed*speed*Math.tan(steerInput*maxSteer)/wheelbase;
    const grip=1.65*9.81*(Math.abs(speed)>0?Math.min(1,Math.abs(speed)/22):0.25);
    const slip=clamp(1-Math.abs(lateralAccel)/Math.max(grip,1),.15,1);
    lateralVelocity+=(-lateralAccel*slip-Math.sin(headingError)*speed*1.4-lateralVelocity*2.7)*dt;
    lateral+=lateralVelocity*dt;
    headingError=clamp(headingError,-.9,.9);
    distance+=Math.max(-3,speed*Math.cos(headingError))*dt;
    if(lateral>6.1||lateral< -6.1){speed=Math.max(0,speed-13*dt);lateralVelocity*=.96;}
    for(const bot of bots){bot.progress+=bot.speed*dt;bot.phase+=dt*.35;bot.lane= (bot.lane<0?-2.25:2.25)+Math.sin(bot.phase)*.42;}
    // Mild arcade contact response when cars overlap.
    for(const bot of bots){if(Math.abs(bot.progress-distance)<5.2&&Math.abs(bot.lane-lateral)<1.9){speed=Math.max(0,speed-8*dt);lateralVelocity+=(lateral<bot.lane?-1:1)*2.5*dt;}}
    updateHud();if(!practice&&distance>=lapLimit*lapMeters){distance=lapLimit*lapMeters;finishRace();}
  }
  function updateVehicles(dt){
    if(player){const pose=placeOnTrack(player,distance,lateral,.05);player.rotation.y=Math.atan2(-pose.tan.x,-pose.tan.z)+headingError;player.rotation.z=clamp(-lateralVelocity*.012,-.12,.12);player.userData.wheelMeshes.forEach(w=>w.rotation.x-=speed*dt/.37);player.userData.frontPivots.forEach(p=>p.rotation.y=clamp((input.right?1:0)-(input.left?1:0),-1,1)*.34);}
    for(const b of bots){const offset=b.lane+Math.sin(b.phase)*.25;const pose=placeOnTrack(b.root,b.progress,offset,.05);b.root.rotation.y=Math.atan2(-pose.tan.x,-pose.tan.z);b.root.userData.wheelMeshes.forEach(w=>w.rotation.x-=b.speed*dt/.37);b.root.userData.frontPivots.forEach(p=>p.rotation.y=Math.sin(b.phase)*.07);}
    if(player){const forward= new THREE.Vector3(-Math.sin(player.rotation.y),0,-Math.cos(player.rotation.y));const desired=player.position.clone().addScaledVector(forward,-10).add(v(0,5.1,0));const look=player.position.clone().addScaledVector(forward,12).add(v(0,1.1,0));camera.position.lerp(desired,1-Math.exp(-dt*3.1));camera.lookAt(look);camera.fov=THREE.MathUtils.lerp(camera.fov,67+Math.min(9,Math.abs(speed)*.1),1-Math.exp(-dt*2));camera.updateProjectionMatrix();}
  }
  function render(){if(!renderer||!scene)return;renderer.render(scene,camera);}
  function animate(now){if(state==='menu'||state==='paused'||state==='finished')return;const dt=Math.min(.04,Math.max(0,(now-lastTime)/1000));lastTime=now;updatePhysics(dt);updateVehicles(dt);render();if(state!=='finished')frameId=requestAnimationFrame(animate);}
  function finishRace(){state='finished';hud.classList.remove('visible');touch.classList.remove('visible');message.classList.remove('visible');const name=(document.querySelector('#driver').value.trim()||'Driver').slice(0,18);const place=1+bots.filter(b=>b.progress>=lapLimit*lapMeters).length;const key=recordKey();let newBest=false;if(!practice){const old=bestTime();if(!old||elapsed<old.time){try{localStorage.setItem(key,JSON.stringify({time:elapsed,name}));newBest=true;}catch(_){}}}document.querySelector('#resultTitle').textContent=place===1?'You win!':`P${place} finish`;document.querySelector('#resultCopy').textContent=`${name} finished in ${formatTime(elapsed)} at ${track.name}.${newBest?' New personal best!':''}`;result.hidden=false;refreshBest();render();}
  function pause(){if(state==='race'||state==='countdown'){state='paused';message.textContent='PAUSED';message.classList.add('visible');cancelAnimationFrame(frameId);}else if(state==='paused'){state='race';message.classList.remove('visible');lastTime=performance.now();frameId=requestAnimationFrame(animate);}}
  document.querySelector('#start').addEventListener('click',()=>startRace(false));document.querySelector('#practice').addEventListener('click',()=>startRace(true));document.querySelector('#pause').addEventListener('click',pause);document.querySelector('#garage').addEventListener('click',backToGarage);document.querySelector('#raceAgain').addEventListener('click',()=>startRace(practice));
  document.querySelector('#track').addEventListener('change',()=>{if(state==='menu'){buildTrack(Number(document.querySelector('#track').value));refreshBest();render();}});document.querySelector('#laps').addEventListener('change',refreshBest);
  function setKey(key,on){if(key==='a'||key==='arrowleft')input.left=on;if(key==='d'||key==='arrowright')input.right=on;if(key==='w'||key==='arrowup')input.gas=on;if(key==='s'||key==='arrowdown')input.brake=on;if(key===' ')input.boost=on;}
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();setKey(k,true);if(!e.repeat&&(k==='p'||k==='escape')){if(state==='finished')backToGarage();else if(state!=='menu')pause();}if(!e.repeat&&k==='enter'&&state==='menu')startRace(false);});window.addEventListener('keyup',e=>setKey(e.key.toLowerCase(),false));window.addEventListener('blur',()=>{Object.keys(input).forEach(k=>input[k]=false);if(state==='race')pause();});
  document.querySelectorAll('[data-control]').forEach(button=>{const key=button.dataset.control;button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);input[key]=true;});['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(type=>button.addEventListener(type,()=>input[key]=false));});
  function refreshBest(){track=tracks[Number(document.querySelector('#track').value)]||tracks[0];lapLimit=Number(document.querySelector('#laps').value)||3;const b=bestTime();document.querySelector('#best').textContent=b?`Best ${track.name} (${lapLimit} laps): ${formatTime(b.time)} — ${b.name}`:'Best time: no record yet';}
  init();refreshBest();
})();
