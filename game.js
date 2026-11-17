'use strict';

(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.querySelector('#stage');
  const menu = document.querySelector('#menu');
  const hud = document.querySelector('#hud');
  const message = document.querySelector('#message');
  const result = document.querySelector('#result');
  const touchControls = document.querySelector('#touchControls');

  const input = {
    left: false,
    right: false,
    gas: false,
    brake: false,
    boost: false
  };

  const TRACKS = [
    {
      name: 'Alpine Run',
      sky1: '#72b5d9',
      sky2: '#e1dfd5',
      grass: '#689e62',
      road: '#30343b',
      stripe: '#f6f6ef',
      curve: 1.1
    },
    {
      name: 'Desert Ring',
      sky1: '#e49a6c',
      sky2: '#f3d8a2',
      grass: '#b59052',
      road: '#343238',
      stripe: '#efe0bd',
      curve: 1.32
    },
    {
      name: 'Coastal Sprint',
      sky1: '#67b8d4',
      sky2: '#dfece5',
      grass: '#66a774',
      road: '#31363b',
      stripe: '#edf5ef',
      curve: 0.82
    }
  ];

  const CAR_COLORS = ['#35d0ff', '#ffc34c', '#ad7ef7', '#7fe29a', '#f4f1ea', '#ff8a53', '#f56eb2', '#62a4ff'];
  const BOT_NAMES = ['NOVA', 'APEX', 'MICA', 'KITE', 'RUSH', 'VOLT', 'JUNO', 'ACE'];

  let width = 0;
  let height = 0;
  let ratio = 1;
  let state = 'menu';
  let track = TRACKS[0];
  let lapLimit = 3;
  let elapsed = 0;
  let distance = 0;
  let speed = 0;
  let playerX = 0;
  let boost = 100;
  let countdown = 3.5;
  let practice = false;
  let opponents = [];
  let lastFrame = 0;

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setMessage(text) {
    message.textContent = text;
    message.classList.toggle('visible', !!text);
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }

  function recordKey() {
    return `slipstream-best-${track.name}-${lapLimit}`;
  }

  function readBest() {
    try {
      const raw = localStorage.getItem(recordKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(recordKey(), JSON.stringify(value));
    } catch {
      // ignore storage errors
    }
  }

  function updateBestRecord() {
    const data = readBest();
    const best = data ? `Best ${track.name} (${lapLimit} laps): ${formatTime(data.time)} — ${data.name}` : 'Best time: no record yet';
    document.querySelector('#bestRecord').textContent = best;
  }

  function updateHud() {
    document.querySelector('#speed').textContent = String(Math.round(speed));
    const currentLap = Math.min(lapLimit, Math.floor(distance / 5000) + 1);
    document.querySelector('#lap').textContent = practice ? '—' : `${currentLap} / ${lapLimit}`;
    const place = 1 + opponents.filter(bot => bot.progress > distance).length;
    document.querySelector('#place').textContent = `${place} / ${opponents.length + 1}`;
    document.querySelector('#time').textContent = formatTime(elapsed);
    document.querySelector('#boostText').textContent = `${Math.round(boost)}%`;
    document.querySelector('#boostFill').style.width = `${boost}%`;
  }

  function polygon(points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawRoad() {
    const horizon = height * 0.42;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, track.sky1);
    sky.addColorStop(1, track.sky2);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);

    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= width + 80; x += 80) {
      ctx.lineTo(x, horizon - 24 - Math.sin(x * 0.012) * 26 - Math.cos(x * 0.02) * 15);
    }
    ctx.lineTo(width, horizon);
    ctx.fill();

    ctx.fillStyle = track.grass;
    ctx.fillRect(0, horizon, width, height - horizon);

    const center = width / 2;
    const cameraCurve = Math.sin(distance * 0.0012 + 0.5) * track.curve;

    for (let i = 150; i > 0; i--) {
      const t1 = i / 150;
      const t0 = (i - 1) / 150;

      const y1 = horizon + (1 - t1) * (1 - t1) * (height - horizon);
      const y0 = horizon + (1 - t0) * (1 - t0) * (height - horizon);

      const w1 = width * (0.035 + t1 * 0.62);
      const w0 = width * (0.035 + t0 * 0.62);

      const curve1 = Math.sin((distance * 0.001 + t1 * 6.4) * 0.8) * track.curve * 1.2;
      const curve0 = Math.sin((distance * 0.001 + t0 * 6.4) * 0.8) * track.curve * 1.2;

      const c1 = center + (curve1 - cameraCurve) * width * 0.85;
      const c0 = center + (curve0 - cameraCurve) * width * 0.85;

      const band = Math.floor((distance / 100 + i) / 4) % 2 === 0;
      polygon([[0, y1], [width, y1], [width, y0], [0, y0]], band ? track.grass : '#5f8d52');

      polygon([[c1 - w1 * 1.06, y1], [c1 + w1 * 1.06, y1], [c0 + w0 * 1.06, y0], [c0 - w0 * 1.06, y0]], band ? track.stripe : '#d93c48');
      polygon([[c1 - w1, y1], [c1 + w1, y1], [c0 + w0, y0], [c0 - w0, y0]], band ? track.road : '#2d3036');

      if (Math.floor((distance / 90 + i) / 5) % 2 === 0) {
        for (let lane = 1; lane <= 2; lane++) {
          const x1a = c1 - w1 + (w1 * 2 * lane / 3);
          const x0a = c0 - w0 + (w0 * 2 * lane / 3);
          polygon([[x1a - t1 * 3, y1], [x1a + t1 * 3, y1], [x0a + t0 * 3, y0], [x0a - t0 * 3, y0]], '#ffffffb0');
        }
      }

      if (i < 8) {
        const barW = (w0 * 2) / 14;
        for (let p = 0; p < 12; p++) {
          ctx.fillStyle = p % 2 ? '#ffffff' : '#1a1b20';
          ctx.fillRect(c0 - w0 + p * barW, y0 - 6, barW + 1, 6);
        }
      }
    }

    // trees / roadside details
    for (let i = 0; i < 22; i++) {
      const z = ((i / 22 + distance / 21000) % 1);
      const y = horizon + z * z * (height - horizon);
      const side = i % 2 ? -1 : 1;
      const x = width / 2 + side * (width * (0.17 + z * 0.42)) + Math.sin(i * 8 + distance * 0.008) * 12;
      const size = 6 + z * 26;
      ctx.fillStyle = (i % 3 === 0) ? '#25764a' : '#1f6f43';
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x - size * 0.7, y + size * 0.25);
      ctx.lineTo(x + size * 0.7, y + size * 0.25);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#6b533d';
      ctx.fillRect(x - 2, y + size * 0.2, 4, size * 0.32);
    }
  }

  function drawCar(x, y, w, h, color, player, labelText) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.35, w * 0.7, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#17191d';
    ctx.fillRect(-w * 0.55, -h * 0.1, w * 0.22, h * 0.45);
    ctx.fillRect(w * 0.33, -h * 0.1, w * 0.22, h * 0.45);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.34);
    ctx.lineTo(-w * 0.43, -h * 0.24);
    ctx.lineTo(-w * 0.25, -h * 0.5);
    ctx.lineTo(w * 0.25, -h * 0.5);
    ctx.lineTo(w * 0.43, -h * 0.24);
    ctx.lineTo(w * 0.5, h * 0.34);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#bcecff';
    ctx.beginPath();
    ctx.moveTo(-w * 0.24, -h * 0.2);
    ctx.lineTo(-w * 0.15, -h * 0.42);
    ctx.lineTo(w * 0.15, -h * 0.42);
    ctx.lineTo(w * 0.24, -h * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.fillRect(-w * 0.38, h * 0.1, w * 0.12, h * 0.06);
    ctx.fillRect(w * 0.26, h * 0.1, w * 0.12, h * 0.06);
    ctx.fillStyle = '#ff2d42';
    ctx.fillRect(-w * 0.4, h * 0.27, w * 0.14, h * 0.07);
    ctx.fillRect(w * 0.26, h * 0.27, w * 0.14, h * 0.07);

    if (player && input.boost && boost > 0 && speed > 70) {
      ctx.fillStyle = '#64d9ff';
      ctx.beginPath();
      ctx.moveTo(-w * 0.14, h * 0.3);
      ctx.lineTo(-w * 0.04, h * 0.72);
      ctx.lineTo(0, h * 0.38);
      ctx.lineTo(w * 0.04, h * 0.72);
      ctx.lineTo(w * 0.14, h * 0.3);
      ctx.fill();
    }

    if (labelText) {
      ctx.font = `900 ${Math.max(10, w * 0.18)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, 0, -h * 0.67);
    }

    ctx.restore();
  }

  function drawOpponents() {
    for (const bot of opponents) {
      const delta = (bot.progress - distance + 20000) % 20000;
      const z = 1 - clamp(delta / 20000, 0, 1);
      if (z < 0.08 || z > 0.96) continue;

      const y = height * 0.42 + z * z * (height * 0.58);
      const roadOffset = Math.sin((distance * 0.001 + z * 7) * 0.9) * track.curve * width * 0.7;
      const x = width / 2 + roadOffset + bot.lane * width * (0.15 + z * 0.4);
      const w = Math.max(12, width * 0.08 * z);
      const h = w * 0.65;
      drawCar(x, y, w, h, bot.color, false, z > 0.35 ? bot.name : '');
    }
  }

  function drawPlayer() {
    const w = Math.min(78, width * 0.10);
    const h = w * 0.63;
    const x = width / 2 + playerX * width * 0.3;
    drawCar(x, height * 0.83, w, h, '#ff3043', true, 'YOU');
  }

  function setRace(trackIndex, practiceMode) {
    practice = practiceMode;
    track = TRACKS[trackIndex] || TRACKS[0];
    lapLimit = Number(document.querySelector('#laps').value) || 3;
    distance = 0;
    speed = 0;
    boost = 100;
    elapsed = 0;
    countdown = 3.5;
    playerX = 0;
    opponents = [];
    if (!practice) {
      const count = Number(document.querySelector('#rivals').value) || 5;
      const difficulty = Number(document.querySelector('#difficulty').value) || 0.9;
      for (let i = 0; i < count; i++) {
        opponents.push({
          name: BOT_NAMES[i % BOT_NAMES.length],
          color: CAR_COLORS[i % CAR_COLORS.length],
          lane: (i % 2 === 0 ? 1 : -1) * (0.4 + (i % 3) * 0.12),
          progress: 70 + i * 110,
          speedScale: (0.9 + Math.random() * 0.28) * difficulty
        });
      }
    }

    menu.style.display = 'none';
    hud.classList.add('visible');
    touchControls.classList.add('visible');
    result.hidden = true;
    state = 'countdown';
    setMessage('3');
    updateHud();
    lastFrame = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function goToMenu() {
    state = 'menu';
    menu.style.display = 'block';
    hud.classList.remove('visible');
    touchControls.classList.remove('visible');
    result.hidden = true;
    setMessage('');
    updateBestRecord();
    render();
  }

  function pauseToggle() {
    if (state === 'race' || state === 'countdown') {
      state = 'paused';
      setMessage('PAUSED');
    } else if (state === 'paused') {
      state = 'race';
      setMessage('');
      lastFrame = performance.now();
      requestAnimationFrame(gameLoop);
    }
  }

  function finishRace() {
    state = 'finished';
    hud.classList.remove('visible');
    touchControls.classList.remove('visible');
    setMessage('');

    const driverName = document.querySelector('#driver').value.trim() || 'Driver';
    const place = 1 + opponents.filter(bot => bot.progress > distance).length;

    const best = readBest();
    let recording = null;

    if (!practice) {
      const current = { name: driverName.slice(0, 18), time: elapsed };
      const prev = readBest();
      if (!prev || elapsed < prev.time) {
        recording = current;
        saveBest(current);
      }
    }

    document.querySelector('#resultTitle').textContent = place === 1 ? 'You win!' : `P${place} finish`;
    const summary = `${driverName} finished in ${formatTime(elapsed)} on ${track.name}.`;
    document.querySelector('#resultText').textContent = recording ? `${summary} New personal best!` : summary;

    result.hidden = false;
    updateBestRecord();
  }

  function render() {
    drawRoad();
    drawOpponents();
    drawPlayer();
  }

  function update(dt) {
    if (state === 'countdown') {
      countdown -= dt;
      if (countdown > 0) {
        setMessage(String(Math.ceil(countdown)));
      } else {
        state = 'race';
        setMessage('GO!');
        setTimeout(() => { if (state === 'race') setMessage(''); }, 650);
      }
    }

    if (state !== 'race') return;

    elapsed += dt;

    const boosting = input.boost && boost > 0 && speed > 60;

    if (input.gas) speed += 200 * dt;
    else speed -= 52 * dt;

    if (input.brake) speed -= 250 * dt;

    if (boosting) {
      speed += 250 * dt;
      boost -= 32 * dt;
    } else {
      boost = clamp(boost + 10 * dt, 0, 100);
    }

    speed = clamp(speed, -50, 360);

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    playerX += steer * (0.76 + speed / 220) * dt;
    playerX = clamp(playerX, -1.3, 1.3);

    if (Math.abs(playerX) > 0.9) {
      speed = Math.max(0, speed - (Math.abs(playerX) - 0.9) * 100 * dt);
    }

    if (boost < 0) boost = 0;

    distance += speed * dt * 1.5;

    for (const bot of opponents) {
      const gap = bot.progress - distance;
      bot.progress += bot.speedScale * 100 * dt;

      if (Math.abs(gap) < 50 && Math.abs(bot.lane - playerX * 0.9) < 0.22) {
        speed *= 0.92;
      }
    }

    updateHud();

    if (!practice && distance >= lapLimit * 5000) {
      finishRace();
      return;
    }
  }

  function gameLoop(ts) {
    if (state === 'menu' || state === 'finished' || state === 'paused') return;

    const dt = Math.min(0.04, Math.max(0, (ts - lastFrame) / 1000 || 0));
    lastFrame = ts;

    update(dt);
    render();

    if (state !== 'finished' && state !== 'paused') {
      requestAnimationFrame(gameLoop);
    }
  }

  function setControl(name, value) {
    if (name in input) input[name] = value;
  }

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();

    if (key === 'a' || key === 'arrowleft') setControl('left', true);
    if (key === 'd' || key === 'arrowright') setControl('right', true);
    if (key === 'w' || key === 'arrowup') setControl('gas', true);
    if (key === 's' || key === 'arrowdown') setControl('brake', true);
    if (key === ' ') setControl('boost', true);

    if (event.key === 'Escape' || key === 'p') {
      if (state === 'menu') return;
      pauseToggle();
    }

    if (key === 'enter' && state === 'menu') {
      setRace(Number(document.querySelector('#track').value), false);
    }
  });

  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();

    if (key === 'a' || key === 'arrowleft') setControl('left', false);
    if (key === 'd' || key === 'arrowright') setControl('right', false);
    if (key === 'w' || key === 'arrowup') setControl('gas', false);
    if (key === 's' || key === 'arrowdown') setControl('brake', false);
    if (key === ' ') setControl('boost', false);
  });

  document.querySelector('#start').addEventListener('click', () => {
    setRace(Number(document.querySelector('#track').value), false);
  });

  document.querySelector('#practice').addEventListener('click', () => {
    setRace(Number(document.querySelector('#track').value), true);
  });

  document.querySelector('#pause').addEventListener('click', pauseToggle);
  document.querySelector('#backToMenu').addEventListener('click', goToMenu);
  document.querySelector('#raceAgain').addEventListener('click', () => {
    setRace(Number(document.querySelector('#track').value), practice);
  });

  document.querySelector('#track').addEventListener('change', () => {
    track = TRACKS[Number(document.querySelector('#track').value)] || TRACKS[0];
    updateBestRecord();
    render();
  });

  document.querySelector('#laps').addEventListener('change', () => {
    updateBestRecord();
  });

  document.querySelectorAll('[data-control]').forEach((button) => {
    const control = button.dataset.control;
    const down = (event) => {
      event.preventDefault();
      setControl(control, true);
    };
    const up = () => setControl(control, false);

    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointerleave', up);
    button.addEventListener('pointercancel', up);
  });

  window.addEventListener('blur', () => {
    Object.keys(input).forEach((key) => input[key] = false);
    if (state === 'race' || state === 'countdown') pauseToggle();
  });

  resize();
  track = TRACKS[0];
  updateBestRecord();
  render();
})();
