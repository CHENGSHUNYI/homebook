// 快速新增範本：點一下就把常用設定帶入表單

export const TEMPLATES = {
  asset: [
    { name: '手機', category: '3C', lifeValue: 5, lifeUnit: 'year' },
    { name: '筆電', category: '3C', lifeValue: 5, lifeUnit: 'year' },
    { name: '平板', category: '3C', lifeValue: 4, lifeUnit: 'year' },
    { name: '手錶', category: '3C', lifeValue: 4, lifeUnit: 'year' },
    { name: '電視', category: '家電', lifeValue: 8, lifeUnit: 'year' },
    { name: '冷氣', category: '家電', lifeValue: 10, lifeUnit: 'year' },
    { name: '冰箱', category: '家電', lifeValue: 10, lifeUnit: 'year' },
    { name: '洗衣機', category: '家電', lifeValue: 10, lifeUnit: 'year' },
    { name: '吸塵器', category: '家電', lifeValue: 5, lifeUnit: 'year' },
    { name: '床墊', category: '家具', lifeValue: 8, lifeUnit: 'year' },
    { name: '汽座', category: '寶寶', lifeValue: 6, lifeUnit: 'year' },
    { name: '機車', category: '交通' },
  ],
  replace: [
    { name: '牙刷', category: '衛浴', intervalValue: 3, intervalUnit: 'month' },
    { name: '電動牙刷頭', category: '衛浴', intervalValue: 3, intervalUnit: 'month' },
    { name: '刮鬍刀片', category: '衛浴', intervalValue: 1, intervalUnit: 'month' },
    { name: '濾水器濾芯', category: '廚房', intervalValue: 6, intervalUnit: 'month' },
    { name: '菜瓜布', category: '廚房', intervalValue: 1, intervalUnit: 'month' },
    { name: '冷氣濾網清洗', category: '家電', intervalValue: 1, intervalUnit: 'month' },
    { name: '抽油煙機清洗', category: '家電', intervalValue: 6, intervalUnit: 'month' },
    { name: '床墊翻面', category: '寢具', intervalValue: 3, intervalUnit: 'month' },
    { name: '枕頭', category: '寢具', intervalValue: 2, intervalUnit: 'year' },
    { name: '隱形眼鏡盒', category: '個人護理', intervalValue: 3, intervalUnit: 'month' },
    { name: '偵煙器電池', category: '居家安全', intervalValue: 1, intervalUnit: 'year' },
    { name: '滅火器', category: '居家安全', intervalValue: 3, intervalUnit: 'year' },
  ],
  consumable: [
    { name: '衛生紙', category: '清潔', unit: '箱' },
    { name: '廚房紙巾', category: '清潔', unit: '串' },
    { name: '洗衣精', category: '清潔', unit: '瓶' },
    { name: '洗碗精', category: '廚房', unit: '瓶' },
    { name: '垃圾袋', category: '清潔', unit: '包' },
    { name: '牙膏', category: '衛浴', unit: '條' },
    { name: '洗髮精', category: '衛浴', unit: '瓶' },
    { name: '沐浴乳', category: '衛浴', unit: '瓶' },
    { name: '尿布', category: '寶寶', unit: '箱' },
    { name: '濕紙巾', category: '寶寶', unit: '箱' },
    { name: '米', category: '廚房', unit: '包' },
  ],
  redpacket: [],
};

export const DEFAULT_CATEGORIES = {
  asset: ['3C', '家電', '家具', '交通', '珠寶精品', '寶寶', '運動'],
  replace: ['衛浴', '廚房', '家電', '寢具', '個人護理', '居家安全'],
  consumable: ['清潔', '衛浴', '廚房', '寶寶', '個人護理'],
  redpacket: ['過年', '滿月', '生日', '婚禮'],
};
