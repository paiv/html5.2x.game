'use strict';

Math.trunc = Math.trunc || function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};

var Sfx = (function () {
  var urls = [
    'sfx/pickup_coin.wav',
    'sfx/drill.wav',
    'sfx/win.wav',
    'sfx/loose.wav'
  ];

  var Sfx = function () {
    var audioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new audioContext();
    this.buffers = {};
    for (var i = 0, len = urls.length; i < len; i++)
      this.load(urls[i], this.decode.bind(this));
  };

  Sfx.prototype.load = function (url, handler) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function() {
      if (this.status < 300)
        handler(url, this.response);
      else
        console.error(this.status, this.statusText, url);
    };

    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.send();
  };

  Sfx.prototype.decode = function (url, buffer) {
    this.context.decodeAudioData(buffer, this.cache.bind(this, url));
  };

  Sfx.prototype.cache = function (url, data) {
    this.buffers[url] = data;
  };

  Sfx.prototype.playBuffer = function (buffer) {
    if (buffer) {
      var source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.start();
    }
  };

  Sfx.prototype.pickupCoin = function () {
    this.playBuffer(this.buffers['pickup_coin.wav']);
  };
  Sfx.prototype.win = function () {
    this.playBuffer(this.buffers['win.wav']);
  };
  Sfx.prototype.loose = function () {
    this.playBuffer(this.buffers['loose.wav']);
  };

  Sfx.prototype.setDrillVolume = function (v) {
    var buffer = this.buffers['drill.wav'];
    if (buffer && !this.drillSource) {
      var source = this.context.createBufferSource();
      var gain = this.context.createGain();
      gain.gain.value = v;
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      gain.connect(this.context.destination);
      this.drillSource = gain;
      source.start();
    }
    if (this.drillSource) {
      this.drillSource.gain.value = v;
    }
  };

  return Sfx;
})();

var GF = (function() {

  var showDebugLayer = false;
  var showFPS = false;
  var enableFogOfWar = true;
  var resetOnWindowResize = false;

  var frameCount = 0;
  var currentTimestamp = 0;
  var fpsContainer;
  var fps;
  var ctx, canvasWidth, canvasHeight, pixelsPerMeter;
  var mapContext, earthContext, fogContext, menuContext;
  var debugContext;
  var keyboard = {};
  var mouse = {};

  var StandardGamepadLayout = {
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LBumper: 4,
    RBumper: 5,
    LTrigger: 6,
    RTrigger: 7,
    Back: 8,
    Start: 9,
    LStick: 10,
    RStick: 11,
    DPadUp: 12,
    DPadDown: 13,
    DPadLeft: 14,
    DPadRight: 15,
    Guide: 16
  };

  var gamepad = {};
  var gamepadLayout = StandardGamepadLayout;
  var gamepadIcon;

  var inputStates = {};

  var sfx = new Sfx();

  var hero = {width: .5, x:-1, y:-1, facing:-Math.PI/2, speed:{x:0, y:0},
    renderBounds: {x: -.35, y: -.35, width: .7, height: .7},
    collidingBody: function() {
      return {type: 'circle', x: this.x, y: this.y, r: this.width / 2}
    }
  };
  var fogOfWar = {width: 20, height: 20, range: 2, visited: [] };
  var collisionMap = {units: []};
  var monster = {width: 1.1, x: 2.5, y: 2.5, speed:{x:0, y:0},
    renderBounds: {x: -.6, y: -.6, width: 1.2, height: 1.2},
    collidingBody: function() {
      return {type: 'circle', x: this.x, y: this.y, r: this.width / 2}
    }
  };
  var treasure = {width: .4, x:-1, y:-1,
    renderBounds: {x: -.35, y: -.35, width: .7, height: .7},
    collidingBody: function() {
      return {type: 'circle', x: this.x, y: this.y, r: this.width / 2}
    }
  };

  var WorldBounds = {x: 0, y: 0, width: -1, height: -1};

  var GameStates = {
    playing: 1,
    gameOver: 2
  };
  var Game = {
    state: GameStates.playing,
    startTime: 0,
    playTime: 0,
    score: 0
  }

  /* map symbols:
     . - empty
     " - tree
     # - wall
     < - exit
     @ - hero
     $ - treasure
     & - monster
  */

  var map1 = {
    width: 10,
    height: 10,
    data:
'" " " " " " " " " "' +
'" . . . . . . . . "' +
'" . . " " " . " " "' +
'" . . . . . . . " "' +
'" " . " # # # " " "' +
'" . . . . . . " " "' +
'" " . " . " " " . "' +
'" . . . . . . . . "' +
'" " " " . " " . @ "' +
'" " " " " " " " < "'
  };


  var measureFPS = function() {
    var lastTime;
    function update(t) {
      if (lastTime === undefined) {
        lastTime = t;
        return;
      }
      var elapsed = t - lastTime;
      if (elapsed >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = t;
      }
      fpsContainer.innerHTML = 'FPS: ' + fps;
      frameCount++;
    }
    return update;
  }();

  function handleKeyUpDown(e) {
    var on = e.type === 'keydown';
    switch (e.keyCode) {
      case 13: keyboard.enter = on;
        break;
      case 27: keyboard.esc = on;
        break;
      case 32: keyboard.space = on;
        break;
      case 37: keyboard.left = on;
        break;
      case 38: keyboard.up = on;
        break;
      case 39: keyboard.right = on;
        break;
      case 40: keyboard.down = on;
        break;
      case 65: keyboard.a = on;
        break;
      case 87: keyboard.w = on;
        break;
      case 68: keyboard.d = on;
        break;
      case 83: keyboard.s = on;
        break;
    }
  }

  function clientPosition(e) {
    var clientRect = e.target.getBoundingClientRect();
    return {x: e.clientX - clientRect.left, y: e.clientY - clientRect.top};
  }

  function handleMouseMove(e) {
    mouse.position = clientPosition(e);
  }

  function handleMouseUpDown(e) {
    var down = e.type === 'mousedown';
    mouse.pressed = down;
  }

  function scanGamepads() {
    var gamepadSupport = true;

    if (navigator.getGamepads) {
      var gamepads = navigator.getGamepads();
      var gp;
      for (var i = 0, len = gamepads.length; i < len; i++)
      {
        if (gamepads[i] && gamepads[i].connected) {
          gp = gamepads[i];
          break;
        }
      }
      gamepad = convertGamepadInput(gp);
    }
    else {
      gamepadSupport = false;
    }

    if (gamepadIcon !== gamepad.connected) {
      var img = document.querySelector('#gamepadIcon');
      if (gamepad.connected) {
        img.classList.remove('disabled');
        img.setAttribute('title', 'Gamepad connected');
      }
      else {
        img.classList.add('disabled');
        img.setAttribute('title', gamepadSupport ? 'To activate Gamepad, press any button' :
          'No Gamepad support in ' + navigator.userAgent);
      }
      gamepadIcon = gamepad.connected;
    }
  }

  function convertGamepadInput(gamepad) {
      var input = {};
      if (gamepad && gamepad.connected) {
        input.connected = true;
        input.buttons = convertGamepadButtons(gamepad);
        input.sticks = convertGamepadAxes(gamepad);
      }
      else {
        input.connected = false;
        input.buttons = [];
        input.sticks = [];
      }
      return input;
  }

  function convertGamepadButtons(gamepad) {
    var deadZone = 0.0009;
    var so = [];
    for (var i = 0, len = gamepad.buttons.length; i < len; i++) {
      var button = gamepad.buttons[i];
      var value = button.value;
      if (value < deadZone) value = 0;
      so.push(value);
    }
    return so;
  }

  function convertGamepadAxes(gamepad) {
    var so = [];
    for (var i = 0, len = gamepad.axes.length; i < len; i++) {
      if (i % 2 == 1) {
        var axes = gamepad.axes.slice(i-1, i+1);
        so.push({
          angle: gamepadStickAngle(axes[0], axes[1]),
          value: gamepadStickValue(axes[0], axes[1]),
          axes: axes
        });
      }
    }
    return so;
  }

  function gamepadStickAngle(axis1, axis2) {
    return Math.atan2(-axis2, axis1) * 180 / Math.PI;
  }
  function gamepadStickValue(axis1, axis2) {
    var magnitudeMax = 1.2;
    var deadZone = 0.25;
    var magnitude = Math.sqrt(axis1 * axis1 + axis2 * axis2);
    if (magnitude > magnitudeMax) magnitude = magnitudeMax;
    if (magnitude < deadZone)
      magnitude = 0;
    else
      magnitude = (magnitude - deadZone) / (magnitudeMax - deadZone);
    return magnitude;
  }

  function convertInputs() {
    inputStates.left = false;
    inputStates.up = false;
    inputStates.right = false;
    inputStates.down = false;

    inputStates.anykey = keyboard.esc || keyboard.enter || keyboard.space;
    if (gamepad.connected) {
      inputStates.anykey = inputStates.anykey ||
        gamepad.buttons[gamepadLayout.A] ||
        gamepad.buttons[gamepadLayout.Back] ||
        gamepad.buttons[gamepadLayout.Start];
    }

    // Gamepad D-pad
    if (gamepad.connected) {
      inputStates.left = gamepad.buttons[14] > 0;
      inputStates.up = gamepad.buttons[12] > 0;
      inputStates.right = gamepad.buttons[15] > 0;
      inputStates.down = gamepad.buttons[13] > 0;
      if (inputStates.left || inputStates.up || inputStates.right || inputStates.down)
        return;
    }

    // Gamepad left stick
    if (gamepad.connected) {
      inputStates.left = gamepad.sticks[0].axes[0] < -0.5;
      inputStates.up = gamepad.sticks[0].axes[1] < -0.5;
      inputStates.right = gamepad.sticks[0].axes[0] > 0.5;
      inputStates.down = gamepad.sticks[0].axes[1] > 0.5;
      if (inputStates.left || inputStates.up || inputStates.right || inputStates.down)
        return;
    }

    // Keyboard (arrows or WASD)
    inputStates.left = keyboard.left || keyboard.a;
    inputStates.up = keyboard.up || keyboard.w;
    inputStates.right = keyboard.right || keyboard.d;
    inputStates.down = keyboard.down || keyboard.s;
  }

  function debugLogEvent(e) {
    console.log((new Date()).getTime(), e.type, e);
  }

  function tile2pos(col, row) {
    var tileWidth = 1;
    var tileHeight = 1;
    return {x: tileWidth * (col + .5), y: tileHeight * (row + 0.5)};
  }

  function tileAtPosition(map, pos) {
    var tileWidth = canvasWidth / pixelsPerMeter / map.width;
    var tileHeight = canvasHeight / pixelsPerMeter / map.height;
    return {col: Math.floor(pos.x / tileWidth), row: Math.floor(pos.y / tileHeight)};
  }

  function tileAtIndex(map, index) {
    var row = Math.floor(index / map.width);
    var col = index % map.width;
    return {col:col, row:row};
  }

  function renderMap(map, ctx) {

    function drawLayerOf(data, features) {
      for (var row = 0, index = 0; row < map.height; row++) {
        for (var col = 0; col < map.width; col++, index++) {
          var x = data.charAt(index);
          if (features.indexOf(x) >= 0)
          switch (x) {
            case '#': drawWall(ctx, tile2pos(col, row)); break;
            case '"': drawTree(ctx, tile2pos(col, row), .5); break;
          }
        }
      }
    }

    var data = map.data.replace(/\s/g, '');

    drawLayerOf(data, '#');
    drawLayerOf(data, '"');
  }

  function mapGetPathMap(map) {
    var pathMap = {};
    var data = map.data.replace(/\s/g, '');
    for (var row = 0, index = 0; row < map.height; row++) {
      for (var col = 0; col < map.width; col++, index++) {
        var x = data.charAt(index);
        switch (x) {
          case '#':
          case '"': break;
          default:
            pathMap[index] = [];
        }
      }
    }

    function neighbors(tile) {
      return [
        {col: tile.col - 1, row: tile.row},
        {col: tile.col + 1, row: tile.row},
        {col: tile.col, row: tile.row - 1},
        {col: tile.col, row: tile.row + 1}
      ];
    }

    var keys = Object.keys(pathMap);
    for (var i = 0, len = keys.length; i < len; i++) {
      var children = pathMap[keys[i]];
      var tile = tileAtIndex(map, keys[i]);
      var neibs = neighbors(tile);
      for (var k = 0, klen = neibs.length; k < klen; k++) {
        var c = neibs[k];
        var childIndex = c.row * map.width + c.col;
        if (pathMap[childIndex])
          children.push(childIndex);
      }
    }

    return pathMap;
  }

  function mapSpawnPositions(map) {

    function getSpawnPosition(data, symbol) {
      var index = data.indexOf(symbol);

      if (index >= 0) {
        var tile = tileAtIndex(map, index);
        return tile2pos(tile.col, tile.row);
      }

      while (true) {
        var col = Math.floor(map.width * Math.random());
        var row = Math.floor(map.height * Math.random());
        var x = data.charAt(row * map.width + col);
        if (x === '.')
          return tile2pos(col, row);
      }
    }

    var data = map.data.replace(/\s/g, '');

    var heroPos = getSpawnPosition(data, '@');
    var treasurePos = getSpawnPosition(data, '$');
    var monsterPos = getSpawnPosition(data, '&');

    return {hero: heroPos, treasure: treasurePos, monster: monsterPos};
  }

  function updateFogOfWar(pos) {
    var changes = [];
    var tileWidth = canvasWidth / pixelsPerMeter / fogOfWar.width;
    var tileHeight = canvasHeight / pixelsPerMeter / fogOfWar.height;

    function pos2tile(pos) {
      return {col: Math.floor(pos.x / tileWidth), row: Math.floor(pos.y / tileHeight)};
    }

    function visit(col, row, markVisited, alpha) {
      if (col >= 0 && row >= 0 && col < fogOfWar.width && row < fogOfWar.height) {
        var offset = row * fogOfWar.width + col;
        if (!fogOfWar.visited[offset]) {
          if (markVisited) fogOfWar.visited[offset] = true;
          changes.push({col: col, row: row, alpha: alpha});
        }
      }
    }

    function visitAround(tile, r, markVisited, alpha) {
      for (var col = tile.col - r, maxCol = tile.col + r + 1; col < maxCol; col++) {
        for (var row = tile.row - r, maxRow = tile.row + r + 1; row < maxRow; row++) {
          visit(col, row, markVisited, alpha);
        }
      }
    }

    visitAround(pos2tile(pos), fogOfWar.range, true, 0);
    visitAround(pos2tile(pos), fogOfWar.range+1, false, .75);

    if (changes.length > 0)
      clearFogOfWar(fogContext, changes);
  }

  function clearFogOfWar(ctx, tiles) {
    var tileWidth = canvasWidth / fogOfWar.width;
    var tileHeight = canvasHeight / fogOfWar.height;

    function tile2pos(tile) {
      return {x: tileWidth * tile.col, y: tileHeight * tile.row};
    }

    function clearTile(tile) {
      var pos = tile2pos(tile);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.clearRect(0, 0, tileWidth, tileHeight);
      ctx.restore();
    }

    function makeSemiTransparent(tile, alpha) {
      if (alpha <= 0)
        return clearTile(tile);

      var alf = Math.round(255 * alpha);

      function resetAlpha(v, i, data) {
        if (i % 4 == 3)
          data[i] = alf;
      }

      var pos = tile2pos(tile);
      var img = ctx.getImageData(pos.x, pos.y, tileWidth, tileHeight);
      for (var i = 0, len = img.data.length; i < len; i++)
        resetAlpha(img.data[i], i, img.data);
      clearTile(tile);
      ctx.putImageData(img, pos.x, pos.y);
    }

    for (var i = 0, len = tiles.length; i < len; i++) {
      var tile = tiles[i];
      makeSemiTransparent(tile, tile.alpha);
    }
  }

  function renderFogOfWar(ctx, map) {
    var tileWidth = canvasWidth / map.width;
    var tileHeight = canvasHeight / map.height;
    ctx.fillStyle = 'rgb(238,238,238)';
    ctx.lineWidth = 1;

    function tile2pos(col, row) {
      return {x: tileWidth * col, y: tileHeight * row};
    }

    function bulge(x, y) {
      ctx.save();
      ctx.strokeStyle = 'hsl(180, 80%,' + Math.round(60 + 20 * Math.random()) + '%)';
      ctx.beginPath();
      ctx.arc(x, y, 4 + 10 * Math.random(), Math.PI * 2 * Math.random(), Math.PI * 2 * Math.random());
      ctx.stroke();
      ctx.restore();
    }

    function hideTile(pos) {
      ctx.save();
      ctx.translate(pos.x, pos.y);

      ctx.fillRect(0, 0, tileWidth, tileHeight);

      var count = 2 * Math.random();
      for (var i = 0; i < count; i++) {
        bulge(tileWidth * Math.random(), tileHeight * Math.random());
      }
      ctx.restore();
    }

    for (var row = 0; row < map.height; row++) {
      for (var col = 0; col < map.width; col++) {
        if (!map.visited[row * map.width + col])
          hideTile(tile2pos(col, row));
      }
    }
  }

  function insideRect(pos, rect) {
    return pos.x >= rect.x && pos.x < (rect.x + rect.width)
      && pos.y >= rect.y && pos.y < (rect.y + rect.height);
  }

  function gameInTerminalCondition() {
    return hero.dead || !insideRect(hero, WorldBounds);
  }

  function gameScore(playTime) {
    function timeBonus(bestTimePossible, t) {
      return Math.max(0, 100 + bestTimePossible - t);
    }
    var score = 0;
    if (!hero.dead) {
      if (hero.hasTreasure)
        score = 100 + timeBonus(10, playTime || 0)
    }
    else {
      score = -100 + timeBonus(0, playTime || 0)
    }
    return Math.trunc(score);
  }

  function mainLoop(timestamp) {
    var dt = timestamp - currentTimestamp;
    currentTimestamp = timestamp;

    if (showFPS)
      measureFPS(timestamp);

    scanGamepads();
    convertInputs();

    switch (Game.state) {

      case GameStates.playing:
        playWorld(dt);
        if (gameInTerminalCondition()) {
          Game.state = GameStates.gameOver;
          Game.playTime = (Date.now() - Game.startTime) / 1000;
          Game.score = gameScore(Game.playTime);
          if (Game.score > 0)
            sfx.win();
          else
            sfx.loose();
        }
        else {
          var r = (canvasWidth - pixelsPerMeter * distance(hero, monster)) / canvasWidth;
          sfx.setDrillVolume(Math.min(1, r * r));
        }
        break;

      case GameStates.gameOver:
        if (inputStates.anykey) {
          Game.state = GameStates.playing;
          clearCanvas();
          startNewGame();
        }
        else {
          showGameOver(dt, menuContext, Game.score);
        }

        sfx.setDrillVolume(0);
        break;
    }


    if (showDebugLayer) {
      debugDrawInputStates(debugContext, 0, 0);
      debugDrawCollisions(debugContext);
    }

    requestAnimationFrame(mainLoop);
  }

  function playWorld(dt) {
    moveUnits(dt);
    drawUnits(dt);
  }

  function showGameOver(dt, ctx, score) {
    var paneHeight = 100;

    ctx.save();
    ctx.translate(0, Math.round((canvasHeight - paneHeight) / 2));

    ctx.fillStyle = 'rgba(204, 204, 204, .1)';
    ctx.fillRect(0, 0, canvasWidth, paneHeight);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.translate(Math.round(canvasWidth / 2), Math.round(paneHeight / 2));
    ctx.fillStyle = 'black';
    ctx.fillText('YOUR SCORE: ' + score, 0, 0);

    ctx.restore();
  }

  function resizeCanvas(container) {
    var style = getComputedStyle(container);
    var canvasWidth = style.getPropertyValue('width');
    var canvasHeight = style.getPropertyValue('height');

    var canvases = container.querySelectorAll('canvas');
    for (var i = 0, len = canvases.length; i < len; i++) {
      var canvas = canvases[i];
      canvas.setAttribute('width', canvasWidth);
      canvas.setAttribute('height', canvasHeight);
    }
  }

  function createCanvas(container) {

    function addLayer(id) {
      var canvas = document.createElement('canvas');
      canvas.id = id;
      container.appendChild(canvas);
      return canvas;
    }

    var earthCanvas = addLayer('earthCanvas');
    var gameCanvas = addLayer('gameCanvas');
    var mapCanvas = addLayer('mapCanvas');
    var fogCanvas = addLayer('fogCanvas');
    var menuCanvas = addLayer('menuCanvas');

    if (showDebugLayer)
      var debugCanvas = addLayer('debugCanvas');

    resizeCanvas(container);

    earthContext = earthCanvas.getContext('2d');
    ctx = gameCanvas.getContext('2d');
    mapContext = mapCanvas.getContext('2d');
    fogContext = fogCanvas.getContext('2d');
    menuContext = menuCanvas.getContext('2d');

    canvasWidth = ctx.canvas.width;
    canvasHeight = ctx.canvas.height;
    pixelsPerMeter = canvasWidth / map1.width;

    ctx.font = '0.8em "Lucida Console", Monaco, monospace';
    menuContext.font = '2em Verdana, Geneva, sans-serif';

    if  (showDebugLayer) {
      debugContext = debugCanvas.getContext('2d');
      debugContext.font = ctx.font;
    }
  }

  function resizeCanvasAndResetGame(container) {
    resizeCanvas(container);
    startNewGame();
  }

  function startNewGame() {
    Game.map = map1;
    Game.pathMap = mapGetPathMap(Game.map);
    Game.pathCache = {};
    Game.score = 0;
    Game.startTime = Date.now();
    Game.playTime = 0;

    renderEarth(earthContext);
    renderMap(Game.map, mapContext);

    WorldBounds.width = Game.map.width;
    WorldBounds.height = Game.map.height;

    var spawnPositions = mapSpawnPositions(Game.map);

    hero.x = spawnPositions.hero.x;
    hero.y = spawnPositions.hero.y;
    hero.facing = -Math.PI/2;
    hero.dead = false;
    hero.hasTreasure = false;

    treasure.x = spawnPositions.treasure.x;
    treasure.y = spawnPositions.treasure.y;

    monster.x = spawnPositions.monster.x;
    monster.y = spawnPositions.monster.y;

    fogOfWar.visited = [];

    if (enableFogOfWar) {
      renderFogOfWar(fogContext, fogOfWar);
      updateFogOfWar(hero);
    }
  }

  function start() {
    loadSprites();

    fpsContainer = document.createElement('div');
    document.body.appendChild(fpsContainer);

    var gameContainer = document.querySelector('#gameContainer');
    createCanvas(gameContainer);

    var resizeTimeout;
    function handleWindowResize() {
      if (resizeTimeout) window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(resizeCanvasAndResetGame, 500, gameContainer);
    }
    if (resetOnWindowResize)
      window.addEventListener('resize', handleWindowResize);

    window.addEventListener('keydown', handleKeyUpDown);
    window.addEventListener('keyup', handleKeyUpDown);

    gameContainer.addEventListener('mousemove', handleMouseMove);
    gameContainer.addEventListener('mousedown', handleMouseUpDown);
    gameContainer.addEventListener('mouseup', handleMouseUpDown);

    scanGamepads();
    window.addEventListener('gamepadconnected', debugLogEvent);
    window.addEventListener('gamepaddisconnected', debugLogEvent);

    startNewGame();

    requestAnimationFrame(mainLoop);
  }

  function clearCanvas() {
    earthContext.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    mapContext.clearRect(0, 0, canvasWidth, canvasHeight);
    fogContext.clearRect(0, 0, canvasWidth, canvasHeight);
    menuContext.clearRect(0, 0, canvasWidth, canvasHeight);
    if (debugContext)
      debugContext.clearRect(0, 0, canvasWidth, canvasHeight);
  }

  function circleToCircleOverlap(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var rs = a.r + b.r;
    return dx*dx + dy*dy <= rs * rs;
  }

  function circleToRectOverlap(circle, rect) {
    var x = circle.x;
    var y = circle.y;
    if (x < rect.x) x = rect.x;
    if (x > rect.x + rect.width) x = rect.x + rect.width;
    if (y < rect.y) y = rect.y;
    if (y > rect.y + rect.height) y = rect.y + rect.height;
    return ((circle.x - x) * (circle.x - x) + (circle.y - y) * (circle.y - y)) <= circle.r * circle.r;
  }

  function rectToRectOverlap(a, b) {
    if ((a.x > b.x + b.width) || (a.x + a.width < b.x))
      return false;
    if ((a.y > b.y + b.height) || (a.y + a.height < b.y))
      return false;
    return true;
  }

  function collide(a, b) {
    if (a.type === 'circle' && b.type == 'circle')
      return circleToCircleOverlap(a, b);
    else if (a.type === 'circle' && b.type == 'rect')
      return circleToRectOverlap(a, b);
    else if (a.type === 'rect' && b.type == 'circle')
      return circleToRectOverlap(b, a);
    else if (a.type === 'rect' && b.type == 'rect')
      return rectToRectOverlap(a, b);
    else return false;
  }

  function checkUnitCollisions() {
    if (collide(hero.collidingBody(), monster.collidingBody()))
      hero.dead = true;
    if (!hero.hasTreasure && collide(hero.collidingBody(), treasure.collidingBody())) {
      hero.hasTreasure = true;
      treasure.prevX = treasure.x;
      treasure.prevY = treasure.y;
      treasure.x = hero.x;
      treasure.y = hero.y;
      treasure.needsClear = true;
      sfx.pickupCoin();
    }
  }

  function isCollisionFree(unit, pos) {
    var target = {type: 'circle', x: pos.x, y: pos.y, r: unit.width / 2};

    for (var i = 0, len = collisionMap.units.length; i < len; i++) {
      var other = collisionMap.units[i];
      if (collide(target, other))
        return false;
    }
    return true;
  }

  function physicsMoveUnit(unit, dt) {
    if (unit.speed.x == 0 && unit.speed.y == 0)
      return false;

    var move = {};
    move.x = (dt / 1000) * unit.speed.x;
    move.y = (dt / 1000) * unit.speed.y;

    var newPos = {
      x: unit.x + move.x,
      y: unit.y + move.y
    };

    if (isCollisionFree(unit, newPos)) {
      unit.prevX = unit.x;
      unit.prevY = unit.y;
      unit.x = newPos.x;
      unit.y = newPos.y;
      return true;
    }
    return false;
  }

  function moveHero(dt, hero) {
    var speed = 3;
    hero.speed.x = inputStates.left ? -speed : inputStates.right ? speed : 0;
    hero.speed.y = inputStates.up ? -speed : inputStates.down ? speed : 0;
    if (hero.speed.x || hero.speed.y)
      hero.facing = Math.atan2(hero.speed.y, hero.speed.x);

    if ((inputStates.left || inputStates.right) && (inputStates.up || inputStates.down)) {
      hero.speed.x *= Math.SQRT1_2;
      hero.speed.y *= Math.SQRT1_2;
    }

    if (physicsMoveUnit(hero, dt) && enableFogOfWar)
      updateFogOfWar(hero);
  }

  function moveMonster(dt, monster) {
    var speed = hero.hasTreasure ? 3.2 : 1;
    var threshold = 0.1;
    var moved = false;

    if (currentTimestamp - monster.planTimestamp > 2000)
      monster.plan = undefined;

    var path = monster.plan;
    if (!path) {
      path = findPath(Game.pathMap, tileAtPosition(Game.map, monster), tileAtPosition(Game.map, hero));
      monster.planTimestamp = currentTimestamp;
    }

    if (path) {
      monster.plan = path;

      while (!moved && path.length > 0) {
        var nextTile = path[0];
        var direction = getDirection(monster, tile2pos(nextTile.col, nextTile.row));
        var r = Math.sqrt(direction.x * direction.x + direction.y * direction.y);

        if (r < threshold) {
          monster.plan = path = path.slice(1);
        }
        else {
          speed = (dt / 1000 * speed) < r + threshold ? speed : r;
          monster.speed.x = speed * direction.x / r;
          monster.speed.y = speed * direction.y / r;
          moved = physicsMoveUnit(monster, dt);
          break;
        }
      }
    }

    if (!moved) {
      monster.plan = undefined;
      monster.prevX = monster.x;
      monster.prevY = monster.y;
    }
  }

  function distance(a, b) {
    var dx = (b.x - a.x);
    var dy = (b.y - a.y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function moveUnits(dt) {
    moveHero(dt, hero);
    moveMonster(dt, monster);
    checkUnitCollisions();

    if (hero.hasTreasure) {
      treasure.x = hero.x;
      treasure.y = hero.y;
      treasure.facing = hero.facing;
    }
  }

  var PriorityQueue = (function () {

    var PriorityQueue = function (mcost) {
      this.items = [];
      this.comp = function (a, b) {
        return mcost.call(b) - mcost.call(a);
      };
    };

    Object.defineProperty(PriorityQueue.prototype, 'length', {
      get: function () {
        return this.items.length;
      }
    });

    PriorityQueue.prototype.push = function (el) {
      this.items.push(el);
      this.items.sort(this.comp);
    };

    PriorityQueue.prototype.pop = function () {
      return this.items.pop();
    };

    PriorityQueue.prototype.addAll = function (items) {
      for (var i = 0, len = items.length; i < len; i++)
        this.push(items[i]);
    };

    return PriorityQueue;
  })();

  function AstarSearch(start, costFunction) {
    var closedSet = {};
    var fringe = new PriorityQueue(costFunction);
    fringe.push(start);

    while (fringe.length > 0) {
      var next = fringe.pop();
      if (next.isTerminal())
        return next;
      if (!closedSet[next.id]) {
        closedSet[next.id] = true;
        fringe.addAll(next.getChildren());
      }
    }
  }

  var PathFindingState = (function () {

    var PathFindingState = function (pathMap, goal, o) {
      this.pathMap = pathMap;
      this.goal = goal;
      this.id = o.id;
      this.path = o.path;
      this.pos = o.pos;
      this.backwardCost = o.backwardCost;
      this.forwardCost = o.forwardCost;
    };

    PathFindingState.prototype.isTerminal = function() {
      return this.pos.col == this.goal.col && this.pos.row == this.goal.row;
    };

    PathFindingState.prototype.getCost = function() {
      return this.backwardCost + this.forwardCost;
    };

    PathFindingState.prototype.getChildren = function() {
      var children = [];
      var neibs = this.pathMap[this.id];

      for (var i = 0, len = neibs.length; i < len; i++) {
        var n = neibs[i];
        var tile = tileAtIndex(Game.map, n);
        var child = new this.constructor(this.pathMap, this.goal, {
          id: n,
          path: this.path.concat([tile]),
          pos: tile,
          backwardCost: this.backwardCost + 1,
          forwardCost: manhattanDistance(tile, this.goal)
        });
        children.push(child);
      }
      return children;
    };

    return PathFindingState;
  })();

  function findPath(pathMap, fromTile, toTile) {
    var mapWidth = Game.map.width;

    if (fromTile.col == toTile.col && fromTile.row == toTile.row)
      return [fromTile];

    function tileStr(tile) {
      return '(' + tile.col + ',' + tile.row + ')';
    }
    function getPathId(fromTile, toTile) {
      return tileStr(fromTile) + '-' + tileStr(toTile);
    }

    var pathId = getPathId(fromTile, toTile);
    var cachedPath = Game.pathCache[pathId];
    if (cachedPath)
      return cachedPath;

    function tileIndex(tile) {
      return tile.row * mapWidth + tile.col;
    }

    var startState = new PathFindingState(pathMap, toTile, {
      id: tileIndex(fromTile),
      path: [fromTile],
      pos: fromTile,
      backwardCost: 0,
      forwardCost: manhattanDistance(fromTile, toTile)
    });

    var found = AstarSearch(startState, startState.getCost);
    cachedPath = found ? found.path : [fromTile, toTile];

    // console.log(pathId, cachedPath);

    for (var i = 0, len = cachedPath.length; i + 1 < len; i++) {
      getPathId(fromTile, toTile);
      Game.pathCache[pathId] = cachedPath;
    }

    return cachedPath;
  }

  function getDirection(fromPos, toPos) {
    return {x: (toPos.x - fromPos.x), y: (toPos.y - fromPos.y)};
  }

  function manhattanDistance(fromTile, toTile) {
    return Math.abs(toTile.col - fromTile.col) + Math.abs(toTile.row - fromTile.row);
  }

  function prerenderClear(ctx, unit) {
    if (unit.prevX === undefined) return;
    var pixelX = unit.prevX * pixelsPerMeter;
    var pixelY = unit.prevY * pixelsPerMeter;
    var rect = unit.renderBounds;
    ctx.save();
    ctx.translate(pixelX, pixelY);
    ctx.clearRect(rect.x * pixelsPerMeter, rect.y * pixelsPerMeter,
      rect.width * pixelsPerMeter, rect.height * pixelsPerMeter);
    ctx.restore();
  }

  function drawHero(hero) {
    var pixelX = hero.x * pixelsPerMeter;
    var pixelY = hero.y * pixelsPerMeter;
    var r = hero.width * pixelsPerMeter / 2;

    ctx.save();
    ctx.translate(pixelX, pixelY);
    ctx.rotate(hero.facing);

    ctx.fillStyle = hero.dead ? 'rgb(168,168,168)' : 'rgb(168,16,0)';
    ctx.beginPath();
    ctx.arc(0, -.7*r, r/2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, .7*r, r/2, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = hero.dead ? 'rgb(228,228,228)' : 'rgb(228,0,88)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = hero.dead ? '#aaa' : '#fff';
    ctx.lineWidth = .25 * r;
    ctx.beginPath();
    ctx.arc(0, 0, .8 * r, -Math.PI * 0.309, Math.PI * 0.309);
    ctx.stroke();

    if (showDebugLayer) {
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawTreasure(unit) {
    var pixelX = unit.x * pixelsPerMeter;
    var pixelY = unit.y * pixelsPerMeter;
    var r = unit.width * pixelsPerMeter / 2;

    if (unit.needsClear) {
      unit.needsClear = false;
      prerenderClear(ctx, unit);
    }

    ctx.save();
    ctx.translate(pixelX, pixelY);
    if (unit.facing)
      ctx.rotate(unit.facing);

    ctx.strokeStyle = 'rgb(136,20,0)';
    ctx.fillStyle = 'rgb(248,216,120)'
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgb(136,20,0)'
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✿', 0, 0);

    ctx.restore();
  }

  function drawMonster(t, unit) {
    if (unit.sprite) {
      var pixelX = Math.round((unit.x - unit.width / 2) * pixelsPerMeter);
      var pixelY = Math.round((unit.y - unit.width / 2) * pixelsPerMeter);
      var pixelWidth = unit.width * pixelsPerMeter;
      var scale = pixelWidth / unit.sprite.frameWidth;

      unit.sprite.render(ctx, t, pixelX, pixelY, scale);
    }
  }

  function drawWall(ctx, pos) {
    var r = .42;
    var wallWidthMeters = r / 5;
    var roofLines = 5;

    var pixelX = pos.x * pixelsPerMeter;
    var pixelY = pos.y * pixelsPerMeter;
    var pixelR = r * pixelsPerMeter;

    ctx.save();
    ctx.translate(pixelX, pixelY);
    ctx.strokeStyle = 'rgb(136,20,0)';
    ctx.fillStyle = 'rgb(252,160,68)'

    function draw(r) {
      var wallWidth = wallWidthMeters * pixelsPerMeter;
      var roofLines = 5;

      ctx.lineWidth = wallWidth;

      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);

      var spacing = (2 * (r - wallWidth)) / roofLines;

      ctx.lineWidth = spacing / 3;
      ctx.lineCap = 'round';

      for (var i = 0; i < roofLines; i++) {
        var y = -r + wallWidth + (i + .5) * spacing;
        var offset = i * spacing;

        ctx.beginPath();
        ctx.moveTo(-r + wallWidth + offset, y);
        ctx.lineTo(r - wallWidth - offset, y)
        ctx.stroke();
      }
    }

    draw(pixelR);
    ctx.restore();

    var bounds = {type: 'rect', x: pos.x-r, y: pos.y-r, width: 2*r, height: 2*r};
    collisionMap.units.push(bounds);
  }

  function drawTree(ctx, pos, r) {
    var pixelX = pos.x * pixelsPerMeter;
    var pixelY = pos.y * pixelsPerMeter;
    var pixelR = r * pixelsPerMeter;

    ctx.save();
    ctx.translate(pixelX, pixelY);
    ctx.lineWidth = 1;

    function circle(x, y, r) {
      ctx.save();
      ctx.scale(.9 + .1 * Math.random(), .9 + .1 * Math.random());
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    var branches = 10;
    var colorG = 90 + Math.round(15 * Math.random());
    var colorStep = Math.round((170 + 15 * Math.random() - colorG) / branches);

    for (var i = 0; i < branches; i++, colorG += colorStep) {
      ctx.fillStyle = 'rgb(0,' + colorG + ',0)';

      circle(
        (-.2 + .4 * Math.random()) * pixelR,
        (-.2 + .4 * Math.random()) * pixelR,
        (.2 + (branches - i) / branches * (.5 + .3 * Math.random())) * pixelR
      );
    }

    ctx.restore();

    var bounds = {type: 'circle', x:pos.x, y:pos.y, r: (r - .48 * hero.width)};
    collisionMap.units.push(bounds);
  }

  function renderEarth(ctx) {
    var canvasWidth = ctx.canvas.width;
    var canvasHeight = ctx.canvas.height;

    ctx.lineWidth = 1;

    function bulge(x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      for (var i = 1; i < 4; i++) {
        var c = 43 + Math.round(30 * Math.random());
        ctx.strokeStyle = 'hsl(45, 100%,' + c + '%)';
        ctx.lineTo(i, -4 * Math.random());
      }
      ctx.stroke();
      ctx.restore();
    }

    var count = 550 + 50 * Math.random();
    for (var i = 0; i < count; i++) {
      bulge(canvasWidth * Math.random(), canvasHeight * Math.random());
    }
  }

  function debugDrawInputStates(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#333';
    var offsetY = 0;
    var linehight = 13;

    if (gamepad.connected) {
      ctx.fillText('gp ' + debugDumpGamepadButtons(gamepad), 0, offsetY += linehight);
      ctx.fillText('axes ' + debugDumpGamepadAxes(gamepad), 0, offsetY += linehight);
    }
    if (mouse.position) {
      ctx.fillText('mouse (' + mouse.position.x + ', ' + mouse.position.y + ') ' +
        (mouse.pressed ? 'down' : ''), 0, offsetY += linehight);
    }
    if (keyboard.space) ctx.fillText('space', 0, offsetY += linehight);
    if (keyboard.left) ctx.fillText('left', 0, offsetY += linehight);
    if (keyboard.up) ctx.fillText('up', 0, offsetY += linehight);
    if (keyboard.right) ctx.fillText('right', 0, offsetY += linehight);
    if (keyboard.down) ctx.fillText('down', 0, offsetY += linehight);
    offsetY += linehight;
    if (keyboard.a) ctx.fillText('a', 0, offsetY);
    if (keyboard.w) ctx.fillText('w', 10, offsetY);
    if (keyboard.s) ctx.fillText('s', 20, offsetY);
    if (keyboard.d) ctx.fillText('d', 30, offsetY);

    ctx.restore();
  }

  function drawUnits(dt) {
    prerenderClear(ctx, hero);
    prerenderClear(ctx, monster);
    drawHero(hero);
    drawTreasure(treasure);
    drawMonster(currentTimestamp, monster);
  }

  function debugDumpGamepadButtons(gamepad) {
    var so = [];
    for (var i = 0, len = gamepad.buttons.length; i < len; i++) {
      var value = gamepad.buttons[i];
      so.push(round2(value));
    }
    return '[' + so.join(',') + ']';
  }

  function debugDumpGamepadAxes(gamepad) {
    var so = [];
    for (var i = 0, len = gamepad.sticks.length; i < len; i++) {
      var stick = gamepad.sticks[i];
      so.push('[' + round0(stick.angle) + 'º ' + round2(stick.value) + ']');
    }
    return so.join(' ');
  }

  function debugDrawCollisions(ctx) {
    ctx.strokeStyle = 'magenta';

    function circle(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    function rect(x, y, w, h) {
      ctx.strokeRect(x, y, w, h);
    }

    function circle_meter(x, y, r) {
      var pixelX = x * pixelsPerMeter;
      var pixelY = y * pixelsPerMeter;
      var pixelR = r * pixelsPerMeter;
      circle(pixelX, pixelY, pixelR);
    }
    function rect_meter(x, y, w, h) {
      var pixelX = x * pixelsPerMeter;
      var pixelY = y * pixelsPerMeter;
      var pixelW = w * pixelsPerMeter;
      var pixelH = h * pixelsPerMeter;
      rect(pixelX, pixelY, pixelW, pixelH);
    }

    for (var i = 0, len = collisionMap.units.length; i < len; i++) {
      var unit = collisionMap.units[i];
      switch (unit.type) {
        case 'circle': circle_meter(unit.x, unit.y, unit.r); break;
        case 'rect': rect_meter(unit.x, unit.y, unit.width, unit.height); break;
      }
    }

    // circle_meter(hero.x, hero.y, hero.width / 2);
  }

  function round0(x) { return Math.round(x); }
  function round2(x) { return Math.round(x * 100) / 100; }

  var SpriteImage = (function() {
    var image, x, y, width, height;

    function SpriteImage(image, x, y, width, height) {
      this.image = image;
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    };

    SpriteImage.prototype.draw = function(ctx, x, y, scale) {
      // ctx.clearRect(x, y, this.width * scale, this.height * scale);
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height,
        x, y, this.width * scale, this.height * scale);
    };

    return SpriteImage;
  })();

  var Sprite = (function() {
    var Sprite = function(sheet, frameWidth, frameHeight, fps) {
      this.sheet = sheet;
      this.frameWidth = frameWidth;
      this.frameHeight = frameHeight;
      this.fps = fps;
      this.frames = parseFrames(sheet, frameWidth, frameHeight);
      this.index = 0;
      this.lastRenderTime = undefined;
    };

    function parseFrames(sheet, w, h) {
      var frames = [];
      for (var y = 0; y < sheet.height; y += h) {
        for (var x = 0; x < sheet.width; x += w) {
          frames.push(new SpriteImage(sheet, x, y, w, h));
        }
      }
      return frames;
    }

    Sprite.prototype.render = function(ctx, t, x, y, scale) {
      if (this.lastRenderTime === undefined ||
          (t - this.lastRenderTime) / 1000 >= 1 / this.fps) {
        this.index = (this.index + 1) % this.frames.length;
        this.lastRenderTime = t;
      }
      this.frames[this.index].draw(ctx, x, y, scale);
    };

    return Sprite;
  })();

  var loadSprites = (function() {

    var spriteSheet = new Image();
    spriteSheet.onload = initSprites;
    spriteSheet.src = 'img/monster.png';

    function initSprites() {
      monster.sprite = new Sprite(spriteSheet, 100, 100, 20);
    }

  });

  var GF = function() {};

  GF.prototype.start = start;
  return GF;
})();


window.onload = function() {
  var img = document.querySelector('#gamepadIcon');
  img.onclick = function() {
    alert(img.title);
  };

  var game = new GF();
  game.start();
};
