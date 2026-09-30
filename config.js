// 论文 B 在线实验 · 配置（其余代码不用改）
// DataPipe（https://pipe.jspsych.org）：每个版本在 DataPipe 上建一个实验（存储选 Zenodo），把它的 Experiment ID
// （12 位字母数字）填在下面。开关的用法见《部署论文B程序_逐步操作》：
//   Accept new data      —— 数据收集：部署后即开（研究者自测也要它）；整个研究结束才关
//   Condition assignment —— 就是「研究开放」的开关：关着时参与者只会看到「本研究暂未开放」；
//                           修订批复、发出启事的那一刻才打开，条件数填下面注释里的数；关闭招募时先关它
//   Data validation 保持默认（JSON 与 CSV、必需字段 trial_type）；Session limit、Psych-DS metadata、
//   Accept base64 file uploads 都不开
// 招募：公开招募志愿者、不付酬（2026-09-29 起）；不用任何被试平台，故没有完成码与平台编号。
window.EXP_CONFIG = {
  m: 40,                         // 正式实验每个取景的评分数；预实验后按功效分析改，并用 B5 重新生成 lists/main_*_m<m>.json
  datapipe: {
    pilot: 'voSI9zTncGUU',       // 预实验：条件数 = 2（2026-09-30 建）
    main_band: 'XXXXXXXXXXXX',   // 正式·水带：条件数 = 9 × m（预实验定下 m、第一阶段稿获原则性接受之后再建）
    main_line: 'XXXXXXXXXXXX',   // 正式·黑线：条件数 = 4 × m（同上）
    withdraw: '8XqdRZxMlHPQ',    // 撤回记录（withdraw.html 用）：只开 Accept new data；每个子研究一个，正式实验前换新编号（现为预实验的，2026-09-30 建）
  },
  contact_email: '3250001012@student.must.edu.mo',
  ethics_ref: 'MUST-FA-2026091',
};
