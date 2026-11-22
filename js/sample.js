// 範例資料：日期都以「今天」往回推算，所以任何時候載入都會有「已到期／快到了／正常」各種狀態可以看
import { today, addDays, addMonths, defaultRpYear } from './logic.js';

export function buildSamples(me = '') {
  const T = today();
  const d = (n) => addDays(T, n);
  const m = (n) => addMonths(T, n);
  const now = Date.now();
  let i = 0;
  const rec = (o) => ({
    id: `sample-${++i}`, sample: true, createdAt: now - i * 60000, updatedAt: now - i * 60000,
    createdBy: me, updatedBy: me, ...o, tags: ['範例', ...(o.tags || [])],
  });
  const log = (kind, date, extra = {}) => ({ id: `s${++i}`, kind, date, ...extra });
  const Y = defaultRpYear() - 1; // 最近一次過年

  return [
    // 💎 貴重物品
    rec({ type: 'asset', name: 'iPhone 13', category: '3C', purchaseDate: addDays(m(-60), 20), price: 25900, store: '燦坤',
      lifeValue: 5, lifeUnit: 'year', tags: ['老公'], note: '128GB 午夜色\n序號寫在盒子背面' }),
    rec({ type: 'asset', name: 'MacBook Air', category: '3C', purchaseDate: m(-14), price: 35900, store: 'Apple 官網',
      lifeValue: 5, lifeUnit: 'year', warrantyUntil: addDays(m(1), -6), tags: ['老婆'], note: '有買 AppleCare+，保固延長到 15 個月' }),
    rec({ type: 'asset', name: '主臥冷氣', category: '家電', purchaseDate: m(-36), price: 42000, store: '全國電子',
      lifeValue: 10, lifeUnit: 'year', warrantyUntil: m(24), tags: ['主臥'], note: '日立 RAC-40\n室外機在後陽台' }),
    rec({ type: 'asset', name: '嬰兒汽座', category: '寶寶', purchaseDate: m(-24), price: 12800, store: 'momo',
      lifeValue: 6, lifeUnit: 'year' }),

    // 🧻 消耗品
    rec({ type: 'consumable', name: '衛生紙', category: '清潔', unit: '箱', price: 599, stock: 0, remindDays: 14,
      note: '好市多那種大箱的', logs: [
        log('buy', d(-400), { qty: 1, price: 599 }), log('start', d(-400)), log('finish', d(-215)),
        log('buy', d(-215), { qty: 1, price: 599 }), log('start', d(-215)), log('finish', d(-30)),
        log('buy', d(-30), { qty: 1, price: 599 }), log('start', d(-30)),
      ] }),
    rec({ type: 'consumable', name: '洗衣精', category: '清潔', unit: '瓶', price: 597, stock: 0, remindDays: 7, logs: [
      log('buy', d(-120), { qty: 3, price: 597 }), log('start', d(-120)), log('finish', d(-82)),
      log('start', d(-82)), log('finish', d(-40)), log('start', d(-40)),
    ] }),
    rec({ type: 'consumable', name: '尿布', category: '寶寶', unit: '箱', price: 1299, stock: 1, estValue: 1, estUnit: 'month', logs: [
      log('buy', d(-20), { qty: 2, price: 1299 }), log('start', d(-20)),
    ] }),

    // 🔁 定期更換
    rec({ type: 'replace', name: '牙刷（老公）', category: '衛浴', intervalValue: 3, intervalUnit: 'month',
      lastDate: d(-95), history: [d(-187), d(-95)] }),
    rec({ type: 'replace', name: '濾水器濾芯', category: '廚房', intervalValue: 6, intervalUnit: 'month',
      lastDate: d(-170), history: [d(-355), d(-170)], note: '型號 3M S004，蝦皮買' }),
    rec({ type: 'replace', name: '冷氣濾網清洗', category: '家電', intervalValue: 1, intervalUnit: 'month',
      lastDate: d(-10), history: [d(-72), d(-41), d(-10)] }),
    rec({ type: 'replace', name: '枕頭', category: '寢具', intervalValue: 2, intervalUnit: 'year', lastDate: m(-12), history: [m(-12)] }),

    // 🧧 紅包
    ...[
      [Y - 1, 'in', '外婆', '小寶', 3600, '媽媽那邊'], [Y - 1, 'in', '大舅', '小寶', 2000, '媽媽那邊'],
      [Y - 1, 'in', '姑姑', '小寶', 1200, '爸爸那邊'], [Y - 1, 'out', '大舅', '小明', 2000, '大舅的兒子'],
      [Y, 'in', '外婆', '小寶', 3600, '媽媽那邊'], [Y, 'in', '外婆', '妞妞', 3600, '媽媽那邊'],
      [Y, 'in', '大舅', '小寶', 2400, '媽媽那邊'], [Y, 'in', '大舅', '妞妞', 2400, '媽媽那邊'],
      [Y, 'in', '王阿姨', '妞妞', 1200, '媽媽的同事'], [Y, 'out', '大舅', '小明', 2400, '大舅的兒子'],
    ].map(([year, direction, name, child, amount, relation]) =>
      rec({ type: 'redpacket', year, direction, name, child, amount, relation, category: '過年', tags: [] })),
  ];
}
