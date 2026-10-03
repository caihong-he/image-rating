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
 *   lang=zh                   中文版（简体，2026-10-01 起）：面向中文社交媒体（小红书、微博、微信等）。文字依获批的附件 03、07
 *                             中文版（繁转简，用语按内地习惯：作業系統→操作系统、資訊→信息、位址→地址、桌上型→台式、
 *                             資料→数据、「」→“”），结束页依英文版 S2 的具体说明译出。与英文版同一个 DataPipe 实验、同一套
 *                             清单与计数；数据多一列 lang（en／zh），撤回链接带上 lang=zh。不给则为英文版
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
  // 语言：L(英文, 中文) 按 lang 取其一；英文版的文字一字未动
  // 界面版本（10-03）：注意检查——同一句提示另以大号黄底框叠在变暗的图片中央、目标端旁加箭头、滑块上方那句加粗放大；
  // 自然度块——整块换浅蓝底、问题移到图片上方加大加框、两端锚点加粗、说明页关键句加大加框且「继续」3 秒后才可点；
  // 指导语里讲注意检查的那句加黄底。只改呈现方式，参与者所见文字一字未改；数据每行带 ui_rev，以区分改动前后的会话
  const UI_REV = '2026-10-03';
  const LANG = P.get('lang') === 'zh' ? 'zh' : 'en';
  const ZH = LANG === 'zh';
  const L = (en, zh) => (ZH ? zh : en);
  if (ZH) { document.documentElement.lang = 'zh-CN'; document.title = '图片评分研究'; }

  // DataPipe 的回应码：研究未开放 / 同名文件已在（= 先前一次已存上）/ 重试也无用的拒收
  const CLOSED_CODES = ['CONDITION_ASSIGNMENT_NOT_ACTIVE', 'EXPERIMENT_NOT_FOUND', 'EXPERIMENT_DATA_NOT_FOUND'];
  const SAVED_CODES = ['FILE_EXISTS', 'OSF_FILE_EXISTS'];
  const CLOSED_AT_SAVE = ['SESSION_LIMIT_REACHED', 'DATA_COLLECTION_NOT_ACTIVE', 'EXPERIMENT_FINALIZED'];
  const FATAL_CODES = CLOSED_AT_SAVE.concat(['EXPERIMENT_NOT_FOUND', 'INVALID_DATA']);

  const NOT_OPEN_HTML = L('<h3>This study is not open at the moment</h3><p>Thank you for your interest. The study is ' +
    'not accepting participants at the moment, so there is nothing to do here and no data have been stored.</p>' +
    '<p>You can close this page now.</p>',
    '<h3>本研究目前暂未开放</h3><p>感谢您的关注。本研究目前不接受参与者，因此这里无需作答，也没有保存任何数据。</p>' +
    '<p>现在可以关闭本页面。</p>');
  const NO_CONNECTION_HTML = L('<h3>We are sorry</h3><p>This study cannot reach its data server from your current ' +
    'internet connection, so your answers could not be saved. Please try again later or on a different network.</p>' +
    '<p>No data have been stored. You can close this page now.</p>',
    '<h3>很抱歉</h3><p>在您当前的网络下，本研究连不上它的数据服务器，您的回答将无法保存。请稍后再试，或换一个网络再试' +
    '（中国内地的网络大多连不上）。</p><p>没有保存任何数据。现在可以关闭本页面。</p>');
  const stopPage = (html) => { document.body.innerHTML = '<div class="instr done-box">' + html + '</div>'; };

  // 图像边长：方案规定 600 像素；窗口不够高时等比缩小，下限 400 像素（浏览器检查保证窗口至少能放下 400 像素）
  const IMG_MAX = 600, IMG_MIN = 400, RESERVE = 230;
  const MIN_W = 1000, MIN_H = IMG_MIN + RESERVE;
  const size = () => Math.max(IMG_MIN, Math.min(IMG_MAX, window.innerHeight - RESERVE));
  // 注意检查与自然度试次的提示更大，占的高度多一些：这两类试次的图相应缩小（不进主分析；普通评分页仍按 size()）
  const EXTRA_H = { check: 10, natural: 26 };
  const sizeFor = (task) => (EXTRA_H[task]
    ? Math.max(IMG_MIN - 40, Math.min(IMG_MAX, window.innerHeight - RESERVE - EXTRA_H[task])) : size());

  // 同一浏览器已经完成过：致谢并结束，不分配清单、不存任何数据（研究者自测与本地测试不受此限）
  if (!LOCAL && !TEST && alreadyDone()) {
    stopPage(L('<h3>Thank you!</h3><p>It looks like this study has already been completed on this browser, so there ' +
      'is no need to take part again.</p><p>You can close this page now.</p>',
      '<h3>谢谢！</h3><p>这个浏览器上已经完成过本研究，无需再次参加。</p><p>现在可以关闭本页面。</p>'));
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
    stopPage(L('<p>Loading…</p>', '<p>正在加载…</p>'));
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
    message_progress_bar: L('Progress', '进度'),
    on_finish: () => { window.__EXP_DATA__ = jsPsych.data.get().values(); window.__EXP_DONE__ = true; },
  });
  if (LOCAL) window.__jsPsych = jsPsych;   // 仅本地测试时暴露，便于自动化检查
  const sessionCode = jsPsych.randomization.randomID(10);
  jsPsych.data.addProperties({
    version: VERSION, cond: COND, recruit: 'volunteer', lang: LANG, test: TEST ? 1 : 0, quick: QUICK ? 1 : 0,
    session_code: sessionCode, local: LOCAL ? 1 : 0, simulate: SIM || '', list_file: LIST_FILE,
    lists_param: SUBSET.join(' '), dpr: window.devicePixelRatio || 1, start_time: new Date().toISOString(),
    ui_rev: UI_REV,
  });

  const img = (id) => 'stim/' + id + '.webp';
  const RATE_LABELS = L(['Not at all beautiful', 'Extremely beautiful'], ['完全不好看', '非常好看']);
  const NAT_LABELS = L(['Not at all', 'Completely'], ['完全不像', '完全像']);

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
  const INSTR_RATE = L('<h3>Instructions</h3><p>For each image, please rate <b>how beautiful you find the image as a whole</b>. Click ' +
    'on the slider to place the marker (from <i>Not at all beautiful</i> to <i>Extremely beautiful</i>), adjust it ' +
    'if you wish, then click <b>Next</b>. There are no right or wrong answers; we are interested in your own ' +
    'impression. Many images will look similar. Please rate each one on its own.</p><p class="check-note">Now and then you will be ' +
    'asked to move the slider all the way to one end. This checks that the instructions are being read.</p>' +
    '<p>You may close the page at any time without giving a reason.</p>',
    '<h3>说明</h3><p>请对每一张图片，评出<b>您觉得这张图片整体有多好看</b>。点击滑轨放置标记（左端为“完全不好看”，' +
    '右端为“非常好看”），可再调整，然后点“下一张”。没有对错，我们关心的是您自己的感受。很多张看起来会很像，' +
    '请把每一张单独来看。</p><p class="check-note">其间会有几次请您把滑杆拖到最左端或最右端，用来确认说明被读到。</p>' +
    '<p>您可以随时关闭页面退出，无须说明理由。</p>');
  const INSTR_NAT = L('<h3>Instructions</h3><p>For each image, please rate <b>how much it looks like a natural ' +
    'river</b>. Click on the slider to place the marker (from <i>Not at all</i> to <i>Completely</i>), adjust it if ' +
    'you wish, then click <b>Next</b>. There are no right or wrong answers.</p>' +
    '<p>You may close the page at any time without giving a reason.</p>',
    '<h3>说明</h3><p>请对每张打分：<b>它有多像一条自然的河流</b>。点击滑轨放置标记（左端为“完全不像”，右端为“完全像”），' +
    '可再调整，然后点“下一张”。没有对错。</p><p>您可以随时关闭页面退出，无须说明理由。</p>');
  let instrViews = 0;
  function showInstrButton(html) {
    let btn = document.getElementById('instr-btn');
    let ov = document.getElementById('instr-overlay');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'instr-btn'; btn.type = 'button'; btn.textContent = L('Instructions', '说明');
      document.body.appendChild(btn);
      ov = document.createElement('div');
      ov.id = 'instr-overlay';
      ov.innerHTML = '<div class="instr-panel"><div id="instr-text"></div><p><button type="button" id="instr-close">' +
        L('Close', '关闭') + '</button></p></div>';
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

  /* ------------------------------------------------ 滑块：问题放在滑块上方；手柄首次点击后才出现；1 秒后解锁。
     10-03：注意检查试次另把同一句提示以醒目的框叠在图片中央（滑块上方的那句照旧保留）；自然度试次把问题移到图片上方并加框，
     让「换了一个问题」一眼可见。文字不变，只改位置与样式 */
  let shownPx = null;
  function prepareSlider(src, task, target) {
    const s = document.querySelector('#jspsych-image-slider-response-response');
    const cont = document.querySelector('.jspsych-image-slider-response-container');
    const q = document.querySelector('#q-prompt');
    const cv = document.querySelector('canvas#jspsych-image-slider-response-stimulus');
    if (q && cv && task === 'natural') {
      q.classList.add('nat-prompt');
      cv.parentNode.insertBefore(q, cv);
    } else if (q && cont) {
      cont.parentNode.insertBefore(q, cont);
    }
    if (q && cv && task === 'check') {
      const box = document.createElement('div');
      box.className = 'stim-box';
      cv.parentNode.insertBefore(box, cv);
      box.appendChild(cv);
      const ov = document.createElement('div');
      ov.className = 'check-overlay';
      ov.innerHTML = '<div class="check-banner" id="check-banner">' + checkBannerHTML(target) + '</div>';
      box.appendChild(ov);
      if (cont) {   // 目标端旁的箭头（图形，不含文字）
        const ar = document.createElement('div');
        ar.className = 'check-arrow ' + (target === 0 ? 'to-left' : 'to-right');
        ar.id = 'check-arrow';
        ar.setAttribute('aria-hidden', 'true');
        ar.innerHTML = '<svg viewBox="0 0 44 26" width="44" height="26"><path d="M3 13h30M24 4l12 9-12 9" fill="none" ' +
          'stroke="#d9480f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        cont.appendChild(ar);
        if (s) ar.style.top = Math.round(s.offsetTop + s.offsetHeight / 2 - 13) + 'px';   // 与滑轨同高
      }
    }
    if (cv) {
      shownPx = cv.width;
      // 高分辨率屏幕（devicePixelRatio > 1）上按设备像素重画，避免插件画布先缩小再放大造成的模糊。
      // 10-01 修正：等插件把画布定好尺寸（cv.height > 0，即插件自己的图已画上）之后再重画。原先在 on_load 时就读
      // cv.height：若此刻插件的图还没解码完，高度是 0，重画时把画布的 CSS 高度设成了 0，图片看不见（Retina 屏上实测出现）
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (dpr > 1 && src) {
        let tries = 0;
        const redraw = () => {
          if (!cv.isConnected || cv.dataset.hidpi) return;
          const w = cv.width, h = cv.height;
          if (!(w > 0 && h > 0)) { if (++tries <= 400) setTimeout(redraw, 25); return; }   // 最多等约 10 秒
          const im = new Image();
          im.onload = () => {
            if (!cv.isConnected || cv.dataset.hidpi || cv.width !== w || cv.height !== h) return;
            cv.dataset.hidpi = '1';
            cv.style.width = w + 'px'; cv.style.height = h + 'px';
            cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
            const ctx = cv.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(im, 0, 0, cv.width, cv.height);
          };
          im.src = src;
        };
        redraw();
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
      stimulus_width: () => sizeFor(task),
      slider_width: () => sizeFor(task),
      labels: labels,
      min: 0, max: 100, step: 1, slider_start: 50,
      require_movement: true,
      button_label: L('Next', '下一张'),
      render_on_canvas: true,
      prompt: () => '<div id="q-prompt" class="' + (task === 'check' ? 'check-prompt' : 'q-prompt') + '">' + promptFn() + '</div>',
      data: { task: task, position: index },
      on_start: () => { shownPx = null; instrViews = 0; },
      on_load: () => {
        prepareSlider(img(getId()), task, getTarget ? getTarget() : null);
        showInstrButton(task === 'natural' ? INSTR_NAT : INSTR_RATE);
      },
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
  // 中文版（10-01）：获批附件 07 的中文版逐句繁转简（用语按内地习惯，见文件头）；各段小标题后换行
  const N_BREAKS = 2;
  const consentHTML = L(
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
    'or corrected-to-normal vision; I have read and understood the above; I agree to take part.</label></p>',
    '<div class="consent-box">' +
    '<h3>研究说明与知情同意</h3>' +
    '<p><b>研究名称：</b>图像取景与审美评价的关系<br>' +
    '<b>研究者：</b>何彩虹，澳门科技大学人文艺术学院博士研究生<br>' +
    '<b>联系方式：</b>' + cfg.contact_email + '<br>' +
    '<b>伦理批准编号：</b>' + cfg.ethics_ref + '</p>' +
    '<p><b>这项研究要做什么</b><br>我们想了解：同一张图片，取景（画面裁切）不同，人们觉得好看的程度会差多少。' +
    '您将看到一系列图片，请对每一张给出您觉得好看的程度。没有正确答案，我们要的是您的直觉。</p>' +
    '<p><b>需要多久</b><br>约 ' + MINUTES + ' 分钟，中间有两次可选的休息。请使用电脑（台式或笔记本）作答。</p>' +
    '<p><b>参与是自愿的</b><br>本研究招募志愿者，不设报酬。参与与否完全由您决定；不参加或中途退出，都不会产生任何后果。' +
    '我们不知道、也无从知道谁参加了。</p>' +
    '<p><b>有什么风险</b><br>预期没有超出日常浏览图片的不适。图片均为中性内容。您可以随时关闭页面退出，无须说明理由。</p>' +
    '<p><b>注意检查</b><br>其中少数几张会请您把滑杆拖到最左端或最右端，用来确认说明被读到。</p>' +
    '<p><b>我们会收集什么</b><br>您对每张图片的评分与作答时间；为按正确尺寸显示图片所需的技术信息（窗口尺寸、浏览器与' +
    '操作系统）；以及结束时几项可不答的问题（年龄段、性别、所在的世界地区、艺术或设计训练、是否曾参加过本研究' +
    (VERSION === 'pilot' ? '，以及一道可不填的意见栏' : '') + '）。我们不收集您的姓名、联系方式、IP 地址或任何可以' +
    '认出您的信息。为避免同一人重复作答，程序会在您的浏览器中记一个不含任何个人信息的“已参加”标记。</p>' +
    '<p><b>数据会怎么用</b><br>用于学术研究与论文发表。论文发表时，我们会公开去标识化的评分数据，以便他人复核我们的结论。' +
    '公开的数据中不含任何可识别您的信息。</p>' +
    '<p><b>我可以退出吗</b><br>可以，随时。若在结束前关闭页面，您的回答一概不保存。您也可以在提交后 14 日内，通过结束页' +
    '的链接撤回您的数据。14 日之后，由于数据已去标识化并可能已并入分析，我们将无法定位到您的单条记录。</p></div>' +
    '<p class="consent-check"><label><input type="checkbox" id="consent-cb"> 我已年满 18 岁，视力正常或矫正后正常；' +
    '我已阅读并理解上述说明；我自愿参加这项研究。</label></p>');

  // 中文版指导语：获批附件 03 的中文第一、二页（繁转简）；第一页按附件 03 的说明补上描述刺激的一句（同英文版
  // 「Each image shows part of a winding shape.」）
  const instrPages = ZH ? [
    '<div class="instr"><h3>说明</h3><p>您会看到一系列图片，每次一张。每张图片显示一个蜿蜒形状的一部分。</p>' +
    '<p>请对每一张图片，评出<b>您觉得这张图片整体有多好看</b>。没有对错，我们关心的是您自己的感受。</p>' +
    '<p>很多张看起来会很像，请把每一张单独来看。</p><p>任务约需 ' + MINUTES + ' 分钟，中途有' +
    (N_BREAKS === 2 ? '两' : N_BREAKS) + '次可选的休息，您可以选择休息或直接继续。您可以随时关闭页面退出，' +
    '无须说明理由。</p></div>',
    '<div class="instr"><h3>如何作答</h3><p>每张图片下方有一条滑杆，左端为“完全不好看”，右端为“非常好看”。' +
    '滑杆稍候才可操作：点击滑轨放置标记，可再调整，然后点“下一张”。</p><p class="check-note">其间会有几次请您把滑杆拖到最左端或最右端，' +
    '用来确认说明被读到。</p><p>评分页右下角的“说明”按钮可随时重新打开这些指导语。</p><p>先做四张练习。</p></div>',
  ] : [
    '<div class="instr"><h3>Instructions</h3><p>In this study you will see a series of images. Each image shows ' +
    'part of a winding shape.</p><p>For each image, please rate <b>how beautiful you find the image as a whole</b>. There are no ' +
    'right or wrong answers; we are interested in your own impression.</p><p>Many images will look similar. ' +
    'Please rate each one on its own.</p><p>The task takes about ' + MINUTES + ' minutes. There are ' + N_BREAKS +
    ' optional breaks along the way; you can take a break or simply continue. You may close the page at any time ' +
    'without giving a reason.</p></div>',
    '<div class="instr"><h3>How to respond</h3><p>Below each image is a slider from <i>Not at all beautiful</i> ' +
    'to <i>Extremely beautiful</i>. The slider becomes active after a moment. Click on the slider to place the ' +
    'marker, adjust it if you wish, then click <b>Next</b>.</p><p class="check-note">Now and then you will be asked to move the ' +
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
      window_resize_message: L('<p>Your browser window is too small for this study. Please enlarge it (at least ' +
        '<span id="browser-check-min-width"></span> × <span id="browser-check-min-height"></span> pixels; now ' +
        '<span id="browser-check-actual-width"></span> × <span id="browser-check-actual-height"></span>). ' +
        'Full-screen mode (F11, or Control-Command-F on a Mac) usually helps.</p>',
        '<p>浏览器窗口太小，无法进行本研究。请把窗口放大（至少 <span id="browser-check-min-width"></span> × ' +
        '<span id="browser-check-min-height"></span> 像素；目前 <span id="browser-check-actual-width"></span> × ' +
        '<span id="browser-check-actual-height"></span>）。全屏模式（F11；Mac 上按 Control-Command-F）通常有帮助。</p>'),
      inclusion_function: (d) => d.mobile === false,
      exclusion_message: (d) => (d.mobile
        ? L('<p>This study needs a laptop or desktop computer. Please open the link on a computer. Thank you!</p>',
          '<p>本研究需要用电脑（台式或笔记本）完成。请在电脑上打开链接。谢谢！</p>')
        : L('<p>Your browser window is too small to show the images at the required size. Please open the link on a ' +
          'computer with a larger screen. Thank you!</p>',
          '<p>浏览器窗口太小，无法按要求的尺寸显示图片。请在屏幕更大的电脑上打开链接。谢谢！</p>')),
      data: { task: 'browser' },
    });
    if (ZH) timeline[timeline.length - 1].resize_fail_button_text = '窗口无法再放大';
  }

  // 同意：须勾选（获批方案「須主動勾選同意方可繼續」）后「Continue」才可点
  let consentChecked = !!SIM;
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: consentHTML,
    choices: L(['Continue', 'I do not wish to take part'], ['继续', '我不想参加']),
    data: { task: 'consent' },
    simulation_options: { data: { response: 0 } },
    on_load: () => {
      const cb = document.getElementById('consent-cb');
      const btn = document.querySelector('#jspsych-html-button-response-btngroup button');
      if (cb && btn) {
        btn.disabled = true;
        btn.title = L('Please tick the box above to continue', '请先勾选上方的方框再继续');
        cb.addEventListener('change', () => { consentChecked = cb.checked; btn.disabled = !cb.checked; });
      }
    },
    on_finish: (d) => {
      d.consent_checked = consentChecked;
      if (d.response !== 0) {
        jsPsych.abortExperiment(L('<p>Thank you. You have chosen not to take part.</p><p>No data from this page are ' +
          'stored. You can close this page now.</p>',
          '<p>谢谢。您选择了不参加。</p><p>本页面不会保存任何数据。现在可以关闭本页面。</p>'));
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

  // 预加载（10-01 改）：一轮里没加载上的图片自动再试，最多三轮（第二、三轮之前各等 3、6 秒）；三轮后仍有失败，才请参与者
  // 检查网络后刷新。失败的文件用插件的 on_error 收集（插件自带的 failed_images 在新版 Chrome 里常常是空的）；某一轮超时则不知道
  // 哪些没加载完，下一轮全部重来（已加载的走浏览器缓存，很快）。每轮在数据里记一行 preload（round、n_images、n_failed）
  const allImages = () => [].concat(LIST.practice, LIST.trials.map((t) => t.id), LIST.natural).map(img);
  const PRELOAD_ROUNDS = 3;
  let preloadRound = 0, preloadPending = [], preloadFailedNow = [];
  timeline.push({
    timeline: [
      {
        timeline: [{
          type: jsPsychCallFunction, async: true,
          func: (done) => { setTimeout(() => done(), 3000 * preloadRound); },
          data: { task: 'preload_wait' },
        }],
        conditional_function: () => preloadRound > 0,
      },
      {
        type: jsPsychPreload,
        images: () => (preloadRound === 0 ? allImages() : preloadPending),
        message: L('<p>Loading images…</p>', '<p>正在加载图片…</p>'),
        show_progress_bar: true,
        max_load_time: () => (preloadRound === 0 ? 180000 : 90000),
        continue_after_error: true,
        on_error: (file) => { preloadFailedNow.push(file); },
        on_start: () => { preloadFailedNow = []; },
        data: { task: 'preload' },
        on_finish: (d) => {
          d.round = preloadRound + 1;
          d.n_images = new Set(preloadRound === 0 ? allImages() : preloadPending).size;
          preloadPending = d.timeout ? allImages() : preloadFailedNow.slice();
          d.n_failed = d.timeout ? -1 : preloadPending.length;
          preloadRound += 1;
        },
      },
    ],
    loop_function: () => preloadPending.length > 0 && preloadRound < PRELOAD_ROUNDS,
  });
  timeline.push({
    timeline: [{
      type: jsPsychHtmlButtonResponse,
      stimulus: L('<p>The images could not be loaded. Please check your connection and reload the page.</p>',
        '<p>图片未能加载。请检查网络连接后刷新页面。</p>'),
      choices: [],
      data: { task: 'preload_failed' },
    }],
    conditional_function: () => preloadPending.length > 0,
  });

  timeline.push({
    type: jsPsychInstructions, pages: instrPages, show_clickable_nav: true,
    button_label_next: L('Next', '下一页'), button_label_previous: L('Back', '上一页'), data: { task: 'instructions' },
  });

  const ratePrompt = () => L('How beautiful is this image?', '这张图片有多好看？');
  // 注意检查的文字（获批原文，见附件 03 第四节）拆成几段：滑块上方那句与叠在图片中央的框共用同一组文字
  const checkParts = (target) => (ZH
    ? { head: '注意检查：', pre: '这一张请把滑杆拖到', dir: target === 0 ? '最左端' : '最右端', post: '。' }
    : { head: 'Attention check:', pre: ' for this image, please move the slider all the way to the ',
      dir: target === 0 ? 'left' : 'right', post: ' end.' });
  const checkPromptHTML = (target) => {
    const c = checkParts(target);
    return '<b>' + c.head + '</b>' + c.pre + '<b>' + c.dir + '</b>' + c.post;
  };
  function checkBannerHTML(target) {
    const c = checkParts(target);
    return '<div class="cb-head"><span class="cb-icon" aria-hidden="true">!</span>' + c.head + '</div>' +
      '<div class="cb-body">' + c.pre.replace(/^\s+/, '') + '<span class="cb-dir">' + c.dir + '</span>' + c.post + '</div>';
  }
  template.practice.forEach((_, i) => {
    timeline.push(sliderTrial('practice', () => LIST.practice[i], ratePrompt, RATE_LABELS, i));
  });
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: L('<div class="instr"><p>The practice is over. The main task starts now.</p></div>',
      '<div class="instr"><p>练习结束，正式任务现在开始。</p></div>'),
    choices: L(['Start'], ['开始']), data: { task: 'start' },
  });

  const NAT_INTRO_MS = 3000;
  const N = template.trials.length;
  const breakEvery = Math.ceil(N / (N_BREAKS + 1));
  template.trials.forEach((t, i) => {
    if (t.kind === 'check') {
      timeline.push(sliderTrial('check', () => LIST.trials[i].id,
        () => checkPromptHTML(LIST.trials[i].target),
        RATE_LABELS, i, () => LIST.trials[i].target));
    } else {
      timeline.push(sliderTrial(t.kind, () => LIST.trials[i].id, ratePrompt, RATE_LABELS, i));
    }
    if ((i + 1) % breakEvery === 0 && i + 1 < N) {
      timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: L('<div class="instr"><p>You may take a short break.</p><p>Click <b>Continue</b> when you are ready.</p></div>',
          '<div class="instr"><p>您可以稍作休息。</p><p>准备好后点“继续”。</p></div>'),
        choices: L(['Continue'], ['继续']), data: { task: 'break' },
      });
    }
  });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: L('<div class="instr"><h3>Almost done</h3><p>You will now see ' + template.natural.length +
      ' images, each showing a longer stretch of a winding shape.</p><p class="nat-key">For each one, please rate <b>how much it ' +
      'looks like a natural river</b>.</p></div>',
      '<div class="instr"><h3>快结束了</h3><p>接下来是 ' + template.natural.length + ' 张图，每张显示蜿蜒形状更长的一段。' +
      '</p><p class="nat-key">请对每张打分：<b>它有多像一条自然的河流</b>。</p></div>'),
    choices: L(['Continue'], ['继续']), data: { task: 'natural_intro' },
    // 10-03：「继续」3 秒后才可点，免得把这一页当作又一个过渡页直接点过去（文字不变）
    on_load: () => {
      const b = document.querySelector('#jspsych-html-button-response-btngroup button');
      if (b && !SIM) { b.disabled = true; setTimeout(() => { b.disabled = false; }, NAT_INTRO_MS); }
      document.documentElement.classList.add('nat-block');   // 自然度块整块换浅蓝底，到背景问项页恢复
    },
  });
  template.natural.forEach((_, i) => {
    timeline.push(sliderTrial('natural', () => LIST.natural[i],
      () => L('How much does this look like a natural river?', '这张图有多像一条自然的河流？'), NAT_LABELS, i));
  });

  const feedbackField = VERSION === 'pilot'
    ? L('<label>Was anything unclear, or did anything not work as expected? (optional)</label>',
      '<label>是否有不清楚或不如预期之处？（可不填）</label>') +
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
  // 中文版：同样的分区与示例国家（附件 03：「中文版以相同分區與示例國家的中文譯名呈現」）；存下的值与英文版相同
  const REGIONS_ZH = {
    eastern_asia: '东亚（如中国、日本、韩国、蒙古）',
    south_eastern_asia: '东南亚（如印度尼西亚、菲律宾、新加坡、泰国、越南）',
    southern_asia: '南亚（如孟加拉国、印度、伊朗、巴基斯坦、斯里兰卡）',
    central_asia: '中亚（如哈萨克斯坦、乌兹别克斯坦）',
    western_asia: '西亚（如以色列、沙特阿拉伯、土耳其、阿拉伯联合酋长国）',
    northern_africa: '北非（如阿尔及利亚、埃及、摩洛哥）',
    sub_saharan_africa: '撒哈拉以南非洲（如埃塞俄比亚、加纳、肯尼亚、尼日利亚、南非）',
    northern_europe: '北欧（如北欧各国、爱尔兰、英国）',
    western_europe: '西欧（如奥地利、法国、德国、荷兰、瑞士）',
    southern_europe: '南欧（如希腊、意大利、葡萄牙、西班牙）',
    eastern_europe: '东欧（如波兰、罗马尼亚、俄罗斯、乌克兰）',
    northern_america: '北美（加拿大、美国）',
    latin_america_caribbean: '拉丁美洲和加勒比（如阿根廷、巴西、墨西哥）',
    australia_nz: '澳大利亚和新西兰',
    pacific_islands: '太平洋岛屿',
    na: '不愿透露',
  };
  const regionLabel = (v, t) => (ZH ? REGIONS_ZH[v] : t);
  timeline.push({
    type: jsPsychSurveyHtmlForm,
    preamble: L('<h3>A few questions about you</h3><p>All questions are optional.</p>',
      '<h3>关于您的几个问题</h3><p>各项均可跳过。</p>'),
    html: '<div class="demog">' +
      L('<label>Age</label>', '<label>年龄段</label>') +
      radios('age', [['18-24', '18–24'], ['25-34', '25–34'], ['35-44', '35–44'], ['45-54', '45–54'],
        ['55+', L('55 or over', '55 岁以上')], ['na', L('Prefer not to say', '不愿透露')]]) +
      L('<label>Gender</label>', '<label>性别</label>') +
      radios('gender', L([['woman', 'Woman'], ['man', 'Man'], ['other', 'Other'], ['na', 'Prefer not to say']],
        [['woman', '女'], ['man', '男'], ['other', '其他'], ['na', '不愿透露']])) +
      L('<label for="region">Region of the world where you live</label>', '<label for="region">所在的世界地区</label>') +
      '<select name="region" id="region"><option value="">' + L('(choose one, or leave blank)', '（选一项，或留空）') +
      '</option>' +
      REGIONS.map(([v, t]) => '<option value="' + v + '">' + regionLabel(v, t) + '</option>').join('') + '</select>' +
      L('<label>Training in art or design</label>', '<label>艺术或设计训练</label>') +
      radios('art', L([['none', 'None'], ['amateur', 'Amateur (courses or hobby)'],
        ['professional', 'Professional (degree or work)'], ['na', 'Prefer not to say']],
        [['none', '无'], ['amateur', '业余（课程或爱好）'], ['professional', '专业（学位或从业）'], ['na', '不愿透露']])) +
      L('<label>Have you taken part in this study before, on this or another device?</label>',
        '<label>是否曾参加过本研究（在这台或其他设备上）？</label>') +
      radios('prior', L([['no', 'No'], ['yes', 'Yes'], ['unsure', 'Not sure']],
        [['no', '否'], ['yes', '是'], ['unsure', '不确定']])) +
      feedbackField + '</div>',
    button_label: L('Continue', '继续'),
    data: { task: 'demographics' },
    on_load: () => { document.documentElement.classList.remove('nat-block'); },
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
            jsPsych.getDisplayElement().innerHTML = L('<p>Saving your responses. Please do not close this page.</p>',
              '<p>正在保存您的回答，请不要关闭本页面。</p>');
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
              ? L('<div class="instr"><p>Your responses could not be saved. This is usually a brief connection ' +
                'problem.</p><p>Please check your internet connection and click <b>Try again</b>.</p></div>',
                '<div class="instr"><p>您的回答未能保存，这通常是短暂的网络问题。</p><p>请检查网络连接，然后点“重试”。</p></div>')
              : (CLOSED_AT_SAVE.includes(saveCode)
                ? L('<div class="instr"><p>We are sorry: the study has just closed, so your responses could not be ' +
                  'saved.</p><p>Thank you very much for your time.</p></div>',
                  '<div class="instr"><p>很抱歉：本研究刚刚关闭，您的回答未能保存。</p><p>非常感谢您抽出时间。</p></div>')
                : L('<div class="instr"><p>We are sorry: the study could not accept your responses, so they have not ' +
                  'been saved.</p><p>Thank you very much for your time.</p></div>',
                  '<div class="instr"><p>很抱歉：本研究未能接收您的回答，回答没有保存。</p><p>非常感谢您抽出时间。</p></div>'))),
            choices: () => (saveFatal ? [L('Finish', '结束')] : (saveTries >= 3
              ? L(['Try again', 'Finish without saving'], ['重试', '不保存，直接结束']) : [L('Try again', '重试')])),
            data: { task: 'save_retry' },
            on_finish: (d) => { if (saveFatal || d.response === 1) saveGiveUp = true; },
          }],
          conditional_function: () => !saveOK,
        },
      ],
      loop_function: () => !saveOK && !saveGiveUp,
    });
  }

  // 中文版结束页：附件 03 第七节的中文结束页（繁转简），其中「各子研究在此寫明其具體問題與刺激來源」一处按英文版 S2 的说明译出
  const debrief = ZH
    ? '<h3>这项研究想了解什么</h3>' +
      '<p>感谢您的参与。这项研究想了解的是：同一张图片，只呈现其中不同的部分时，人们觉得好看的程度会改变多少。我们关心的' +
      '不是哪一张更好看，而是同一个对象的不同呈现之间，评分差异有多大。图片由描述自然河流形状的数学曲线生成，取景按固定' +
      '规则放置。所以很多张看起来很像：它们是同一条曲线的不同取景。最后我们请您评价那些较长的形状有多像自然的河流，是为了' +
      '核对这些曲线确实如设计的那样在这方面有所不同。</p>' +
      '<p>研究中没有任何误导，除开头说明过的注意检查外没有隐藏的测量。如有任何疑问，或希望了解研究结果，欢迎联系：何彩虹　' +
      cfg.contact_email + '</p>'
    : '<h3>What this study was about</h3>' +
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
    u.search = '?c=' + encodeURIComponent(sessionCode) + (ZH ? '&lang=zh' : '') + (LOCAL ? '&local=1' : '');
    return u.toString();
  };
  const withdrawHTML = () => (ZH
    ? '<h3>您的数据与撤回的权利</h3>' +
      '<p>您的回答在保存时不带任何可以认出您的信息。若您希望撤回您的数据，请在 14 日内点击下方链接；若日后链接打不开，' +
      '请写信至 ' + cfg.contact_email + ' 并注明本页显示的撤回码 <span class="wcode">' + sessionCode + '</span>' +
      '（程序随机生成的 10 位码，与身份无关；请记下）。14 日之后，数据已去标识化并可能已并入分析，我们将无法定位到您的' +
      '单条记录。</p><p><a href="' + withdrawURL() + '" target="_blank" rel="noopener">撤回我的数据</a>（在新标签页打开）</p>'
    : '<h3>Your data and your right to withdraw</h3>' +
    '<p>Your responses are stored without anything that could identify you. If you would like to withdraw your ' +
    'data, please use this link within 14 days: <a href="' + withdrawURL() + '" target="_blank" ' +
    'rel="noopener">Withdraw my data</a> (it opens in a new tab). If the link does not work later, write to ' +
    cfg.contact_email + ', quoting your withdrawal code <span class="wcode">' + sessionCode + '</span> (please note ' +
    'it down). After 14 days the data are de-identified and may already be part of the analysis, so we will not be ' +
    'able to locate your individual record.</p>');
  const ethicsNote = L('<p class="small">Researcher: Caihong He (' + cfg.contact_email + '). This study was reviewed ' +
    'and approved by the Research Ethics Committee of the Faculty of Humanities and Arts, Macau University of ' +
    'Science and Technology (approval number ' + cfg.ethics_ref + ').</p>',
    '<p class="small">研究者：何彩虹（' + cfg.contact_email + '）。本研究经澳门科技大学人文艺术学院研究伦理委员会审查，' +
    '批准编号 ' + cfg.ethics_ref + '。</p>');

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: () => {
      if (LOCAL) {
        return '<div class="instr">' + debrief + withdrawHTML() + ethicsNote + L('<p><b>Test run.</b> List: ' +
          (LIST ? LIST.list_id : '') + '. Data are kept in this page only.</p></div>',
          '<p><b>测试运行。</b>清单：' + (LIST ? LIST.list_id : '') + '。数据只保存在本页面中。</p></div>');
      }
      if (!saveOK) {  // 未存上（含没填 DataPipe 编号的自测）
        return '<div class="instr">' + debrief + L('<p class="end-thanks">Your responses were not saved, so there is ' +
          'nothing to withdraw. Thank you very much for your time. You can close this page now.</p>',
          '<p class="end-thanks">您的回答未保存，故无须撤回。非常感谢您抽出时间。现在可以关闭本页面。</p>') + ethicsNote +
          '</div>';
      }
      return '<div class="instr">' + debrief + withdrawHTML() + ethicsNote + L('<p class="end-thanks">Your responses ' +
        'have been saved. Thank you very much for your help. You can close this page now.</p></div>',
        '<p class="end-thanks">您的回答已保存。非常感谢您的帮助。现在可以关闭本页面。</p></div>');
    },
    // 正式运行时结束页没有按钮（参与者读完即可关闭页面）；本地测试时提供数据下载
    choices: () => (LOCAL ? [L('Download data (CSV)', '下载数据（CSV）')] : []),
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
