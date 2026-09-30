/* 论文 B · 在线评分实验（jsPsych 8.3）
 *
 * 网址参数：
 *   v=pilot | main            版本（缺省 pilot）
 *   cond=band | line          正式实验的渲染条件（预实验固定为 band）
 *   list=<整数>               指定清单序号（从 0 起；研究者自测时用）；不给则由 DataPipe 顺序分配
 *   lists=<整数,整数,…>       补发用：只在这些清单里轮流分配（DataPipe 计数对清单个数取余）。补发时把带此参数的
 *                             链接另行发出
 *   test=1                    研究者自测：照常保存到 DataPipe，但标为测试会话（分析时剔除）；不写「已参加」标记；
 *                             研究未开放（DataPipe 未开 Condition assignment）时也能进入，清单随机
 *   quick=1                   只与 test=1 同用：缩短为 1 张练习、4 张评分（含 1 个注意检查）、1 张自然度，约 1 分钟，
 *                             用来检验「保存 → Zenodo」与撤回整条通道（数据照常标为测试会话）
 *   local=1                   本地测试：不连 DataPipe，结束时在页面上提供数据下载
 *   simulate=data-only|visual jsPsych 模拟运行（自动作答，只用于测试程序）
 *
 * 招募（2026-09-29 起）：公开招募志愿者、不付酬、全程匿名（见伦理修订申请第二份）。程序不接收任何平台编号；
 * 同一浏览器完成过一次后，在 localStorage 记一个不含个人信息的「已参加」标记（键 imgrate_done），再次打开时
 * 直接致谢并结束；结束前另问一句「是否参加过」，分析时据以剔除重复作答。
 *
 * 开放与关闭（2026-09-30 起）：研究是否接受参与者，由 DataPipe 上该实验的 Condition assignment 开关决定——
 * 关着时，参与者读完同意书、勾选并继续后即见「本研究暂未开放」，不进入任务、不存任何数据。关闭招募时先关这个开关，
 * 一天后（正在作答的人都已提交）再关 Accept new data。另：同意书之前先测一次能否连上 DataPipe（连不上的网络，
 * 例如中国内地，数据存不下来），连不上就当场说明并结束，免得参与者做完才发现存不了。
 *
 * 清单文件由 02_刺激生成/B5_清单生成.py 生成；同一版本的所有清单结构相同（试次类型与位置一致），
 * 因此时间线可以先按结构搭好，取景编号在同意书之后分配清单时再填入。
 */
(async function () {
  'use strict';
  const P = new URLSearchParams(window.location.search);
  const VERSION = P.get('v') === 'main' ? 'main' : 'pilot';
  const COND = VERSION === 'main' && P.get('cond') === 'line' ? 'line' : 'band';
  const SIM = ['data-only', 'visual'].includes(P.get('simulate')) ? P.get('simulate') : null;
  const LOCAL = P.get('local') === '1' || SIM !== null;
  const cfg = window.EXP_CONFIG;
  const KEY = VERSION === 'pilot' ? 'pilot' : 'main_' + COND;
  const EXP_ID = cfg.datapipe[KEY];
  const DATAPIPE_READY = !!EXP_ID && !EXP_ID.startsWith('XXXX');
  const TEST = P.get('test') === '1';
  const QUICK = TEST && P.get('quick') === '1';
  const PIPE = 'https://pipe.jspsych.org/';
  const DONE_KEY = 'imgrate_done';
  const alreadyDone = () => { try { return !!window.localStorage.getItem(DONE_KEY); } catch (e) { return false; } };
  const markDone = () => { try { window.localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* 隐私模式等：忽略 */ } };
  const SUBSET = (P.get('lists') || '').split(',').map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x));
  const LIST_FILE = VERSION === 'pilot' ? 'lists/pilot.json' : 'lists/main_' + COND + '_m' + cfg.m + '.json';
  const MINUTES = VERSION === 'pilot' ? 16 : (COND === 'band' ? 12 : 10);

  // DataPipe 的回应码：研究未开放 / 同名文件已在（= 先前一次已存上）/ 重试也无用的拒收
  const CLOSED_CODES = ['CONDITION_ASSIGNMENT_NOT_ACTIVE', 'EXPERIMENT_NOT_FOUND', 'EXPERIMENT_DATA_NOT_FOUND'];
  const SAVED_CODES = ['FILE_EXISTS', 'OSF_FILE_EXISTS'];
  const CLOSED_AT_SAVE = ['SESSION_LIMIT_REACHED', 'DATA_COLLECTION_NOT_ACTIVE', 'EXPERIMENT_FINALIZED'];
  const FATAL_CODES = CLOSED_AT_SAVE.concat(['EXPERIMENT_NOT_FOUND', 'INVALID_DATA']);

  const NOT_OPEN_HTML = '<h3>This study is not open at the moment</h3><p>Thank you for your interest. The study is ' +
    'not accepting participants at the moment, so there is nothing to do here and no data have been stored.</p>' +
    '<p>You can close this page now.</p>';
  const NO_CONNECTION_HTML = '<h3>We are sorry</h3><p>This study cannot reach its data server from your current ' +
    'internet connection, so your answers could not be saved. Please try again later or on a different network.</p>' +
    '<p>No data have been stored. You can close this page now.</p>';
  const stopPage = (html) => { document.body.innerHTML = '<div class="instr done-box">' + html + '</div>'; };

  // 图像边长：方案规定 600 像素；窗口不够高时等比缩小，下限 400 像素（浏览器检查保证窗口至少能放下 400 像素）
  const IMG_MAX = 600, IMG_MIN = 400, RESERVE = 230;
  const MIN_W = 1000, MIN_H = IMG_MIN + RESERVE;
  const size = () => Math.max(IMG_MIN, Math.min(IMG_MAX, window.innerHeight - RESERVE));

  // 同一浏览器已经完成过：致谢并结束，不分配清单、不存任何数据（研究者自测与本地测试不受此限）
  if (!LOCAL && !TEST && alreadyDone()) {
    stopPage('<h3>Thank you!</h3><p>It looks like this study has already been completed on this browser, so there ' +
      'is no need to take part again.</p><p>You can close this page now.</p>');
    return;
  }
  // 数据通道还没接上（config.js 里没有该版本的 DataPipe 编号）：对参与者一律显示「未开放」
  if (!LOCAL && !TEST && !DATAPIPE_READY) { stopPage(NOT_OPEN_HTML); return; }

  // 带超时的请求（被墙的网络常常不报错而是一直挂着）
  async function fetchT(url, opts, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, Object.assign({ signal: ctl.signal }, opts)); } finally { clearTimeout(timer); }
  }
  // 能否连上 DataPipe：取一次网站图标（no-cors，不读内容、不碰数据接口、不留任何记录）
  async function pipeReachable() {
    try { await fetchT(PIPE + 'favicon.ico?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }, 15000); return true; }
    catch (e) { return false; }
  }
  // 向 DataPipe 要清单序号；返回 {condition} 或 {error}
  async function requestCondition() {
    try {
      const r = await fetchT(PIPE + 'api/condition/', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: '*/*' },
        body: JSON.stringify({ experimentID: EXP_ID }),
      }, 15000);
      const j = await r.json();
      return (j && typeof j === 'object') ? j : { error: 'BAD_RESPONSE' };
    } catch (e) { return { error: 'NETWORK' }; }
  }

  if (!LOCAL && DATAPIPE_READY) {
    stopPage('<p>Loading…</p>');
    if (!(await pipeReachable())) { stopPage(NO_CONNECTION_HTML); return; }
    document.body.innerHTML = '';
  }

  const design = await (await fetch(LIST_FILE, { cache: 'no-store' })).json();
  if (QUICK) {   // 研究者的通道自测：每份清单只留少数试次（结构不变）
    design.lists = design.lists.map((L) => {
      const rates = L.trials.filter((t) => t.kind !== 'check');
      const chk = L.trials.filter((t) => t.kind === 'check');
      return Object.assign({}, L, { practice: L.practice.slice(0, 1), trials: [rates[0], chk[0], rates[1], rates[2]],
        natural: L.natural.slice(0, 1) });
    });
  }
  const template = design.lists[0];
  let LIST = null;
  let LIST_INDEX = null;

  const jsPsych = initJsPsych({
    show_progress_bar: true,
    message_progress_bar: 'Progress',
    on_finish: () => { window.__EXP_DATA__ = jsPsych.data.get().values(); window.__EXP_DONE__ = true; },
  });
  if (LOCAL) window.__jsPsych = jsPsych;   // 仅本地测试时暴露，便于自动化检查
  const sessionCode = jsPsych.randomization.randomID(10);
  jsPsych.data.addProperties({
    version: VERSION, cond: COND, recruit: 'volunteer', test: TEST ? 1 : 0, quick: QUICK ? 1 : 0,
    session_code: sessionCode, local: LOCAL ? 1 : 0, simulate: SIM || '', list_file: LIST_FILE,
    lists_param: SUBSET.join(' '), dpr: window.devicePixelRatio || 1, start_time: new Date().toISOString(),
  });

  const img = (id) => 'stim/' + id + '.webp';
  const RATE_LABELS = ['Not at all beautiful', 'Extremely beautiful'];
  const NAT_LABELS = ['Not at all', 'Completely'];

  // 补发模式下把计数映射到指定的清单子集
  const pick = (c) => (SUBSET.length ? SUBSET[((c % SUBSET.length) + SUBSET.length) % SUBSET.length] : c);
  const randomIndex = () => Math.floor(Math.random() * (SUBSET.length || design.n_lists));

  function assignList(idx, source) {
    LIST_INDEX = ((idx % design.n_lists) + design.n_lists) % design.n_lists;
    LIST = design.lists[LIST_INDEX];
    jsPsych.data.addProperties({ list_index: LIST_INDEX, list_id: LIST.list_id, list_source: source });
  }

  // 模拟运行时先分配清单（模拟模式不执行异步回调）
  if (SIM) assignList(P.get('list') !== null ? parseInt(P.get('list'), 10) : pick(randomIndex()), 'simulate');

  /* ------------------------------------------------ 评分页上随时可看的指导语（获批研究计划：「可隨時回看指導語」） */
  const INSTR_RATE = '<h3>Instructions</h3><p>For each image, please rate <b>how beautiful you find the image as a whole</b>. Click ' +
    'on the slider to place the marker (from <i>Not at all beautiful</i> to <i>Extremely beautiful</i>), adjust it ' +
    'if you wish, then click <b>Next</b>. There are no right or wrong answers; we are interested in your own ' +
    'impression. Many images will look similar. Please rate each one on its own.</p><p>Now and then you will be ' +
    'asked to move the slider all the way to one end. This checks that the instructions are being read.</p>' +
    '<p>You may close the page at any time without giving a reason.</p>';
  const INSTR_NAT = '<h3>Instructions</h3><p>For each image, please rate <b>how much it looks like a natural ' +
    'river</b>. Click on the slider to place the marker (from <i>Not at all</i> to <i>Completely</i>), adjust it if ' +
    'you wish, then click <b>Next</b>. There are no right or wrong answers.</p>' +
    '<p>You may close the page at any time without giving a reason.</p>';
  let instrViews = 0;
  function showInstrButton(html) {
    let btn = document.getElementById('instr-btn');
    let ov = document.getElementById('instr-overlay');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'instr-btn'; btn.type = 'button'; btn.textContent = 'Instructions';
      document.body.appendChild(btn);
      ov = document.createElement('div');
      ov.id = 'instr-overlay';
      ov.innerHTML = '<div class="instr-panel"><div id="instr-text"></div><p><button type="button" id="instr-close">' +
        'Close</button></p></div>';
      document.body.appendChild(ov);
      btn.addEventListener('click', () => { instrViews += 1; ov.classList.add('open'); });
      ov.querySelector('#instr-close').addEventListener('click', () => ov.classList.remove('open'));
    }
    ov.querySelector('#instr-text').innerHTML = html;
    ov.classList.remove('open');
    btn.classList.add('show');
  }
  function hideInstrButton() {
    const btn = document.getElementById('instr-btn');
    const ov = document.getElementById('instr-overlay');
    if (btn) btn.classList.remove('show');
    if (ov) ov.classList.remove('open');
  }

  /* ------------------------------------------------ 滑块：问题放在滑块上方；手柄首次点击后才出现；1 秒后解锁 */
  let shownPx = null;
  function prepareSlider(src) {
    const s = document.querySelector('#jspsych-image-slider-response-response');
    const cont = document.querySelector('.jspsych-image-slider-response-container');
    const q = document.querySelector('#q-prompt');
    const cv = document.querySelector('canvas#jspsych-image-slider-response-stimulus');
    if (q && cont) cont.parentNode.insertBefore(q, cont);
    if (cv) {
      shownPx = cv.width;
      // 高分辨率屏幕（devicePixelRatio > 1）上按设备像素重画，避免插件画布先缩小再放大造成的模糊
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (dpr > 1 && src) {
        const w = cv.width, h = cv.height;
        const im = new Image();
        im.onload = () => {
          if (!cv.isConnected) return;
          cv.style.width = w + 'px'; cv.style.height = h + 'px';
          cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
          const ctx = cv.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(im, 0, 0, cv.width, cv.height);
        };
        im.src = src;
      }
    }
    if (!s) return;
    s.classList.add('no-thumb');
    const reveal = () => s.classList.remove('no-thumb');
    ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'input', 'change'].forEach((ev) => s.addEventListener(ev, reveal));
    if (!SIM) {
      s.disabled = true;
      setTimeout(() => { s.disabled = false; }, 1000);
    }
  }

  function sliderTrial(task, getId, promptFn, labels, index, getTarget) {
    return {
      type: jsPsychImageSliderResponse,
      stimulus: () => img(getId()),
      stimulus_width: size,
      slider_width: size,
      labels: labels,
      min: 0, max: 100, step: 1, slider_start: 50,
      require_movement: true,
      button_label: 'Next',
      render_on_canvas: true,
      prompt: () => '<div id="q-prompt" class="' + (task === 'check' ? 'check-prompt' : 'q-prompt') + '">' + promptFn() + '</div>',
      data: { task: task, position: index },
      on_start: () => { shownPx = null; instrViews = 0; },
      on_load: () => { prepareSlider(img(getId())); showInstrButton(task === 'natural' ? INSTR_NAT : INSTR_RATE); },
      on_finish: (d) => {
        hideInstrButton();
        d.view_id = getId();
        d.check_target = getTarget ? getTarget() : null;
        d.win_w = window.innerWidth; d.win_h = window.innerHeight; d.img_px = shownPx;
        d.instr_views = instrViews;
      },
      post_trial_gap: 250,
    };
  }

  /* ------------------------------------------------ 文本 */
  // 同意书：志愿者版（2026-09-30），与伦理修订申请第二份所附的英文知情同意书逐句一致。
  // 9-30 晚：不列导师姓名（修订申请第一节第 2 条第 (4) 款：避免经联合国渠道来的参与者因导师职务感到压力）。
  // 改这里之前先改 `99 共用/预注册与伦理/论文B_知情同意与研究说明_v4_2026-09-30.md`。
  const N_BREAKS = 2;
  const consentHTML =
    '<div class="consent-box">' +
    '<h3>Information and consent</h3>' +
    '<p><b>Study:</b> Framing and aesthetic evaluation of images<br>' +
    '<b>Researcher:</b> Caihong He, PhD candidate, Faculty of Humanities and Arts, Macau University of Science and ' +
    'Technology<br><b>Contact:</b> ' + cfg.contact_email + '<br>' +
    '<b>Ethics approval number:</b> ' + cfg.ethics_ref + '</p>' +
    '<p><b>What is this study about?</b> We want to know how much people’s liking of a picture changes when the ' +
    'picture is framed (cropped) differently. You will see a series of images and rate how beautiful you find each ' +
    'one. There are no right answers — we want your immediate impression.</p>' +
    '<p><b>How long will it take?</b> About ' + MINUTES + ' minutes, with two optional short breaks. Please use a ' +
    'laptop or desktop computer.</p>' +
    '<p><b>Taking part is voluntary.</b> This study recruits volunteers and offers no payment. Whether you take ' +
    'part is entirely up to you; not taking part, or stopping partway, has no consequences of any kind. We do not ' +
    'know, and cannot find out, who took part.</p>' +
    '<p><b>Risks.</b> We expect no discomfort beyond that of looking at everyday pictures. All images are neutral. ' +
    'You may close the page and withdraw at any time without giving a reason.</p>' +
    '<p><b>Attention checks.</b> A few trials ask you to move the slider all the way to one end. They check that ' +
    'the instructions are being read.</p>' +
    '<p><b>What we collect.</b> Your rating and response time for each image; the technical details needed to show ' +
    'the images at the right size (window size, browser and operating system); and a few optional questions at the ' +
    'end (age band, gender, the region of the world where you live, training in art or design, and whether you have ' +
    'taken part before' + (VERSION === 'pilot' ? ', plus an optional comment box' : '') + '). We do not collect your ' +
    'name, contact details, IP address, or anything that could identify ' +
    'you. To avoid the same person taking part twice, the study stores a marker in your browser that says only that ' +
    'the study has been completed on this browser; it contains no personal information.</p>' +
    '<p><b>How the data will be used.</b> For academic research and publication. When the work is published we ' +
    'will make the de-identified ratings openly available so that others can check our conclusions. The public ' +
    'data will contain nothing that identifies you.</p>' +
    '<p><b>Can I withdraw?</b> Yes, at any time. If you close the page before the end, none of your responses are ' +
    'stored. You may also withdraw your data within 14 days of submission using the link on the final page. After ' +
    '14 days the data are de-identified and may already be part of the analysis, so we will not be able to locate ' +
    'your individual record.</p></div>' +
    '<p class="consent-check"><label><input type="checkbox" id="consent-cb"> I am 18 years or older and have normal ' +
    'or corrected-to-normal vision; I have read and understood the above; I agree to take part.</label></p>';

  const instrPages = [
    '<div class="instr"><h3>Instructions</h3><p>In this study you will see a series of images. Each image shows ' +
    'part of a winding shape.</p><p>For each image, please rate <b>how beautiful you find the image as a whole</b>. There are no ' +
    'right or wrong answers; we are interested in your own impression.</p><p>Many images will look similar. ' +
    'Please rate each one on its own.</p><p>The task takes about ' + MINUTES + ' minutes. There are ' + N_BREAKS +
    ' optional breaks along the way; you can take a break or simply continue. You may close the page at any time ' +
    'without giving a reason.</p></div>',
    '<div class="instr"><h3>How to respond</h3><p>Below each image is a slider from <i>Not at all beautiful</i> ' +
    'to <i>Extremely beautiful</i>. The slider becomes active after a moment. Click on the slider to place the ' +
    'marker, adjust it if you wish, then click <b>Next</b>.</p><p>Now and then you will be asked to move the ' +
    'slider all the way to one end. This checks that the instructions are being read.</p><p>You can see these ' +
    'instructions again at any time with the <b>Instructions</b> button at the bottom right of the screen.</p>' +
    '<p>We start with four practice images.</p></div>',
  ];

  /* ------------------------------------------------ 时间线 */
  const timeline = [];

  if (!SIM) {
    timeline.push({
      type: jsPsychBrowserCheck,
      features: ['width', 'height', 'browser', 'browser_version', 'mobile', 'os'],
      minimum_width: MIN_W, minimum_height: MIN_H,
      window_resize_message: '<p>Your browser window is too small for this study. Please enlarge it (at least ' +
        '<span id="browser-check-min-width"></span> × <span id="browser-check-min-height"></span> pixels; now ' +
        '<span id="browser-check-actual-width"></span> × <span id="browser-check-actual-height"></span>). ' +
        'Full-screen mode (F11, or Control-Command-F on a Mac) usually helps.</p>',
      inclusion_function: (d) => d.mobile === false,
      exclusion_message: (d) => (d.mobile
        ? '<p>This study needs a laptop or desktop computer. Please open the link on a computer. Thank you!</p>'
        : '<p>Your browser window is too small to show the images at the required size. Please open the link on a ' +
          'computer with a larger screen. Thank you!</p>'),
      data: { task: 'browser' },
    });
  }

  // 同意：须勾选（获批方案「須主動勾選同意方可繼續」）后「Continue」才可点
  let consentChecked = !!SIM;
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: consentHTML,
    choices: ['Continue', 'I do not wish to take part'],
    data: { task: 'consent' },
    simulation_options: { data: { response: 0 } },
    on_load: () => {
      const cb = document.getElementById('consent-cb');
      const btn = document.querySelector('#jspsych-html-button-response-btngroup button');
      if (cb && btn) {
        btn.disabled = true;
        btn.title = 'Please tick the box above to continue';
        cb.addEventListener('change', () => { consentChecked = cb.checked; btn.disabled = !cb.checked; });
      }
    },
    on_finish: (d) => {
      d.consent_checked = consentChecked;
      if (d.response !== 0) {
        jsPsych.abortExperiment('<p>Thank you. You have chosen not to take part.</p><p>No data from this page are ' +
          'stored. You can close this page now.</p>');
      }
    },
  });

  if (!SIM) {
    timeline.push({
      type: jsPsychCallFunction,
      async: true,
      func: (done) => {
        const ov = P.get('list');
        if (ov !== null && ov !== '') { assignList(parseInt(ov, 10), 'url'); return done(LIST_INDEX); }
        const tag = SUBSET.length ? '_subset' : '';
        if (LOCAL || !DATAPIPE_READY) { assignList(pick(randomIndex()), 'random' + tag); return done(LIST_INDEX); }
        requestCondition().then((r) => {
          if (typeof r.condition === 'number' && isFinite(r.condition)) {
            assignList(pick(r.condition), 'datapipe' + tag);
          } else if (CLOSED_CODES.includes(r.error) && !TEST) {
            jsPsych.abortExperiment(NOT_OPEN_HTML);           // 研究未开放：不进入任务、不存数据
            return;
          } else {
            assignList(pick(randomIndex()), (CLOSED_CODES.includes(r.error) ? 'random_test' : 'random_fallback') + tag);
          }
          done(LIST_INDEX);
        });
      },
      data: { task: 'assign' },
    });
  }

  timeline.push({
    type: jsPsychPreload,
    images: () => [].concat(LIST.practice, LIST.trials.map((t) => t.id), LIST.natural).map(img),
    message: '<p>Loading images…</p>',
    show_progress_bar: true,
    max_load_time: 180000,
    error_message: '<p>The images could not be loaded. Please check your connection and reload the page.</p>',
    data: { task: 'preload' },
  });

  timeline.push({
    type: jsPsychInstructions, pages: instrPages, show_clickable_nav: true,
    button_label_next: 'Next', button_label_previous: 'Back', data: { task: 'instructions' },
  });

  const ratePrompt = () => 'How beautiful is this image?';
  template.practice.forEach((_, i) => {
    timeline.push(sliderTrial('practice', () => LIST.practice[i], ratePrompt, RATE_LABELS, i));
  });
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: '<div class="instr"><p>The practice is over. The main task starts now.</p></div>',
    choices: ['Start'], data: { task: 'start' },
  });

  const N = template.trials.length;
  const breakEvery = Math.ceil(N / (N_BREAKS + 1));
  template.trials.forEach((t, i) => {
    if (t.kind === 'check') {
      timeline.push(sliderTrial('check', () => LIST.trials[i].id,
        () => '<b>Attention check:</b> for this image, please move the slider all the way to the <b>' +
          (LIST.trials[i].target === 0 ? 'left' : 'right') + '</b> end.',
        RATE_LABELS, i, () => LIST.trials[i].target));
    } else {
      timeline.push(sliderTrial(t.kind, () => LIST.trials[i].id, ratePrompt, RATE_LABELS, i));
    }
    if ((i + 1) % breakEvery === 0 && i + 1 < N) {
      timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: '<div class="instr"><p>You may take a short break.</p><p>Click <b>Continue</b> when you are ready.</p></div>',
        choices: ['Continue'], data: { task: 'break' },
      });
    }
  });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: '<div class="instr"><h3>Almost done</h3><p>You will now see ' + template.natural.length +
      ' images, each showing a longer stretch of a winding shape.</p><p>For each one, please rate <b>how much it ' +
      'looks like a natural river</b>.</p></div>',
    choices: ['Continue'], data: { task: 'natural_intro' },
  });
  template.natural.forEach((_, i) => {
    timeline.push(sliderTrial('natural', () => LIST.natural[i], () => 'How much does this look like a natural river?',
      NAT_LABELS, i));
  });

  const feedbackField = VERSION === 'pilot'
    ? '<label>Was anything unclear, or did anything not work as expected? (optional)</label>' +
      '<textarea name="feedback" rows="3" cols="60"></textarea>'
    : '';
  // 背景问项：按获批的「各項均可跳過」——不设必答；年龄用年龄段；「所在地區」按联合国 M49 的地理分区（比国家更粗；
  // 参与者只选分区、不填国家，选项里举几个国家作例子方便选择）；「艺术或设计训练」「是否参加过」两项按修订申请增列
  const radios = (name, opts) => opts.map(([v, t]) =>
    '<span class="opt"><input type="radio" name="' + name + '" value="' + v + '"> ' + t + '</span>').join('');
  const REGIONS = [
    ['eastern_asia', 'Eastern Asia (e.g., China, Japan, Korea, Mongolia)'],
    ['south_eastern_asia', 'South-eastern Asia (e.g., Indonesia, Philippines, Singapore, Thailand, Viet Nam)'],
    ['southern_asia', 'Southern Asia (e.g., Bangladesh, India, Iran, Pakistan, Sri Lanka)'],
    ['central_asia', 'Central Asia (e.g., Kazakhstan, Uzbekistan)'],
    ['western_asia', 'Western Asia (e.g., Israel, Saudi Arabia, Türkiye, United Arab Emirates)'],
    ['northern_africa', 'Northern Africa (e.g., Algeria, Egypt, Morocco)'],
    ['sub_saharan_africa', 'Sub-Saharan Africa (e.g., Ethiopia, Ghana, Kenya, Nigeria, South Africa)'],
    ['northern_europe', 'Northern Europe (e.g., Nordic countries, Ireland, United Kingdom)'],
    ['western_europe', 'Western Europe (e.g., Austria, France, Germany, Netherlands, Switzerland)'],
    ['southern_europe', 'Southern Europe (e.g., Greece, Italy, Portugal, Spain)'],
    ['eastern_europe', 'Eastern Europe (e.g., Poland, Romania, Russian Federation, Ukraine)'],
    ['northern_america', 'Northern America (Canada, United States)'],
    ['latin_america_caribbean', 'Latin America and the Caribbean (e.g., Argentina, Brazil, Mexico)'],
    ['australia_nz', 'Australia and New Zealand'],
    ['pacific_islands', 'Pacific Islands'],
    ['na', 'Prefer not to say'],
  ];
  timeline.push({
    type: jsPsychSurveyHtmlForm,
    preamble: '<h3>A few questions about you</h3><p>All questions are optional.</p>',
    html: '<div class="demog">' +
      '<label>Age</label>' +
      radios('age', [['18-24', '18–24'], ['25-34', '25–34'], ['35-44', '35–44'], ['45-54', '45–54'],
        ['55+', '55 or over'], ['na', 'Prefer not to say']]) +
      '<label>Gender</label>' +
      radios('gender', [['woman', 'Woman'], ['man', 'Man'], ['other', 'Other'], ['na', 'Prefer not to say']]) +
      '<label for="region">Region of the world where you live</label>' +
      '<select name="region" id="region"><option value="">(choose one, or leave blank)</option>' +
      REGIONS.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('') + '</select>' +
      '<label>Training in art or design</label>' +
      radios('art', [['none', 'None'], ['amateur', 'Amateur (courses or hobby)'],
        ['professional', 'Professional (degree or work)'], ['na', 'Prefer not to say']]) +
      '<label>Have you taken part in this study before, on this or another device?</label>' +
      radios('prior', [['no', 'No'], ['yes', 'Yes'], ['unsure', 'Not sure']]) +
      feedbackField + '</div>',
    button_label: 'Continue',
    data: { task: 'demographics' },
  });

  /* ------------------------------------------------ 保存到 DataPipe（连接问题自动重试；三次失败后允许不保存而结束。
     DataPipe 明确拒收〔研究已关闭、已达上限等〕时不再重试，当即说明。未存上的会话不写「已参加」标记） */
  const filename = () => VERSION + '_' + COND + '_' + (LIST ? LIST.list_id : 'na') + '_' + sessionCode + '.csv';
  let saveOK = false, saveTries = 0, saveGiveUp = false, saveFatal = false, saveCode = '';
  if (!LOCAL && DATAPIPE_READY) {
    timeline.push({
      timeline: [
        {
          type: jsPsychCallFunction,
          async: true,
          func: (done) => {
            saveTries += 1;
            jsPsych.getDisplayElement().innerHTML = '<p>Saving your responses. Please do not close this page.</p>';
            const csv = jsPsych.data.get().csv();
            jsPsychPipe.saveData(EXP_ID, filename(), csv).then((r) => {
              const obj = !!r && typeof r === 'object' && !(r instanceof Error);
              const code = obj ? (r.error || '') : 'NETWORK';
              saveOK = obj && (!r.error || SAVED_CODES.includes(r.error));
              saveFatal = !saveOK && FATAL_CODES.includes(code);
              saveCode = code;
              done({ ok: saveOK ? 1 : 0, attempt: saveTries,
                error: saveOK ? '' : String(code || (r && r.message) || r) });
            }).catch((e) => { saveOK = false; done({ ok: 0, attempt: saveTries, error: String(e) }); });
          },
          data: { task: 'save' },
        },
        {
          timeline: [{
            type: jsPsychHtmlButtonResponse,
            stimulus: () => (!saveFatal
              ? '<div class="instr"><p>Your responses could not be saved. This is usually a brief connection ' +
                'problem.</p><p>Please check your internet connection and click <b>Try again</b>.</p></div>'
              : (CLOSED_AT_SAVE.includes(saveCode)
                ? '<div class="instr"><p>We are sorry: the study has just closed, so your responses could not be ' +
                  'saved.</p><p>Thank you very much for your time.</p></div>'
                : '<div class="instr"><p>We are sorry: the study could not accept your responses, so they have not ' +
                  'been saved.</p><p>Thank you very much for your time.</p></div>')),
            choices: () => (saveFatal ? ['Finish'] : (saveTries >= 3 ? ['Try again', 'Finish without saving'] : ['Try again'])),
            data: { task: 'save_retry' },
            on_finish: (d) => { if (saveFatal || d.response === 1) saveGiveUp = true; },
          }],
          conditional_function: () => !saveOK,
        },
      ],
      loop_function: () => !saveOK && !saveGiveUp,
    });
  }

  const debrief =
    '<h3>What this study was about</h3>' +
    '<p>Thank you for taking part. We are studying whether some shapes are judged more <b>consistently</b> ' +
    'than others — that is, whether they look about equally beautiful whichever part of them you see. The ' +
    'images were generated by computer from mathematical curves of the kind used to describe the shapes of ' +
    'natural rivers, and the frames were placed on those curves by a fixed rule. This is why many images ' +
    'looked similar: they show the same curve through different frames. At the end we asked how much the ' +
    'whole shapes look like a natural river, to check that the curves differ in that respect as intended.</p>' +
    '<p>Nothing in the study was misleading, and there were no hidden measures other than the attention ' +
    'checks described at the start. If you have questions, or would like to hear about the results, please ' +
    'write to ' + cfg.contact_email + '.</p>';

  // 撤回链接：按获批的「提交後 14 日內，通過結束頁的鏈接撤回」。链接带本次会话的撤回码（session_code，随机 10 位，
  // 与任何身份信息无关），在新标签页打开 withdraw.html，由参与者确认后经 DataPipe 记录；B4 的 deid 据此剔除该会话。
  const withdrawURL = () => {
    const u = new URL('withdraw.html', window.location.href);
    u.search = '?c=' + encodeURIComponent(sessionCode) + (LOCAL ? '&local=1' : '');
    return u.toString();
  };
  const withdrawHTML = () =>
    '<h3>Your data and your right to withdraw</h3>' +
    '<p>Your responses are stored without anything that could identify you. If you would like to withdraw your ' +
    'data, please use this link within 14 days: <a href="' + withdrawURL() + '" target="_blank" ' +
    'rel="noopener">Withdraw my data</a> (it opens in a new tab). If the link does not work later, write to ' +
    cfg.contact_email + ', quoting your withdrawal code <span class="wcode">' + sessionCode + '</span> (please note ' +
    'it down). After 14 days the data are de-identified and may already be part of the analysis, so we will not be ' +
    'able to locate your individual record.</p>';
  const ethicsNote = '<p class="small">Researcher: Caihong He (' + cfg.contact_email + '). This study was reviewed ' +
    'and approved by the Research Ethics Committee of the Faculty of Humanities and Arts, Macau University of ' +
    'Science and Technology (approval number ' + cfg.ethics_ref + ').</p>';

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: () => {
      if (LOCAL) {
        return '<div class="instr">' + debrief + withdrawHTML() + ethicsNote + '<p><b>Test run.</b> List: ' +
          (LIST ? LIST.list_id : '') + '. Data are kept in this page only.</p></div>';
      }
      if (!saveOK) {  // 未存上（含没填 DataPipe 编号的自测）
        return '<div class="instr">' + debrief + '<p class="end-thanks">Your responses were not saved, so there is ' +
          'nothing to withdraw. Thank you very much for your time. You can close this page now.</p>' + ethicsNote +
          '</div>';
      }
      return '<div class="instr">' + debrief + withdrawHTML() + ethicsNote + '<p class="end-thanks">Your responses ' +
        'have been saved. Thank you very much for your help. You can close this page now.</p></div>';
    },
    // 正式运行时结束页没有按钮（参与者读完即可关闭页面）；本地测试时提供数据下载
    choices: () => (LOCAL ? ['Download data (CSV)'] : []),
    data: { task: 'end' },
    on_load: () => { if (!LOCAL && !TEST && saveOK) markDone(); },
    on_finish: () => { if (LOCAL && !SIM) jsPsych.data.get().localSave('csv', filename()); },
  });

  if (SIM) {
    await jsPsych.simulate(timeline, SIM, {});
  } else {
    await jsPsych.run(timeline);
  }
})();
