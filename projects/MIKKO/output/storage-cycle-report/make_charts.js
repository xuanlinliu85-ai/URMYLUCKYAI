const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = __dirname;
const C = {
  bg:'#F7F5EF', ink:'#16202A', navy:'#153B5B', blue:'#2E6F95', gold:'#D99A2B',
  orange:'#C86B35', olive:'#7A8B52', grey:'#747B82', light:'#E8E4DB', white:'#FFFFFF'
};
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rect = (x,y,w,h,fill,stroke='none',sw=0,rx=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const line = (x1,y1,x2,y2,color=C.ink,sw=2,dash='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
function text(x,y,s,size=24,color=C.ink,weight=400,anchor='start') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}" font-family="Microsoft YaHei,Arial,sans-serif">${esc(s)}</text>`;
}
function lines(x,y,arr,size=24,color=C.ink,weight=400,anchor='start',dy=1.35) {
  const spans=arr.map((s,i)=>`<tspan x="${x}" dy="${i?size*dy:0}">${esc(s)}</tspan>`).join('');
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}" font-family="Microsoft YaHei,Arial,sans-serif">${spans}</text>`;
}
function base(w=1800,h=1080) {
  return {w,h,head:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rect(0,0,w,h,C.bg)}`};
}
function header(w,title,sub){
  return text(80,82,title,42,C.ink,700)+text(80,128,sub,20,C.grey,400)+rect(80,155,w-160,6,C.gold);
}
function footer(w,h,s){return text(80,h-32,s,15,C.grey,400);}
async function write(name,svg){
  const svgPath=path.join(OUT,name.replace('.png','.svg'));
  fs.writeFileSync(svgPath,svg,'utf8');
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT,name));
}

async function cover(){
  const {w,h}=base(1800,1080);
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rect(0,0,w,h,C.navy)}`;
  s+=rect(105,160,18,720,C.gold)+text(175,310,'存储周期进入二阶导',62,C.white,700)+text(175,415,'长协抬高下限，还是利润见顶？',42,'#F5D28B',700);
  s+=lines(175,540,['从七家财报、长期协议、库存与宏观资本开支','拆解这一轮存储行情正在交易什么'],28,'#D9E2E8',400,'start',1.65);
  const pts=[]; for(let i=0;i<80;i++){const x=980+i*8.2; const y=760-150*Math.sin(i/17)-2.4*i; pts.push(`${x},${y}`)}
  s+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${C.gold}" stroke-width="8"/>`;
  s+=text(1040,810,'价格上行',20,C.white,600)+text(1260,585,'盈利爆发',20,C.white,600)+text(1470,420,'斜率放缓',20,'#F5D28B',600);
  s+=text(175,930,'MIKKO Research · 2026年8月',19,'#AFC2CF',400)+'</svg>';
  await write('00_cover.png',s);
}

async function earnings(){
  const {w,h,head}=base(2000,1250); let s=head+header(w,'七家存储公司：业绩仍强，指引开始分化','收入单位与会计口径不同；用于识别方向与预期差，不用于直接比较利润率');
  const headers=['公司','业务','本季收入','利润率','下一季 / 预期差'];
  const xs=[80,280,620,1000,1320], ws=[200,340,380,320,600];
  headers.forEach((v,i)=>{s+=rect(xs[i],205,ws[i],70,C.navy,C.bg,2)+text(xs[i]+16,250,v,22,C.white,700)});
  const rows=[
    ['美光','DRAM+NAND','$41.46B / +74% QoQ','84.9% 毛利率','强指引，但涨价斜率放缓',C.gold],
    ['SK海力士','DRAM+HBM+NAND','₩79.3T / +257% YoY','76% 营业利润率','部分指标低于高预期',C.orange],
    ['三星DS','DRAM+NAND','₩12.75T','70% 营业利润率','展望积极，量化信息有限',C.blue],
    ['铠侠','NAND','¥1.767T / +76% QoQ','75% 营业利润率','下一季指引不及高预期',C.orange],
    ['闪迪','NAND','$8.97B / +51% QoQ','84.6% 毛利率','$10.3–10.8B，低于激进预期',C.orange],
    ['希捷','HDD','$3.63B / +48% QoQ','44.6% 营业利润率','收入和EPS指引高于预期',C.olive],
    ['西部数据','HDD','$3.75B / +44% YoY','44.2% 营业利润率','$4.1B中值，继续超预期',C.olive]
  ];
  rows.forEach((r,ri)=>{const y=275+ri*112, fill=ri%2? '#EEEAE1':C.white; xs.forEach((x,i)=>s+=rect(x,y,ws[i],104,fill,'#D6D1C7',1)); s+=rect(80,y,9,104,r[5]); r.slice(0,5).forEach((v,i)=>s+=text(xs[i]+16,y+62,v,i===0?23:20,C.ink,i===0?700:400));});
  s+=text(80,1120,'读图：NAND链的预期差开始转弱，但HDD仍在兑现订单与利润率。存储已经不是一个单一周期。',24,C.navy,700);
  s+=footer(w,h,'来源：Micron、Sandisk、Western Digital等公司财报；铠侠/三星/海力士依据用户提供的公司与高盛汇总图。')+'</svg>';
  await write('01_earnings_matrix.png',s);
}

async function micron(){
  const {w,h,head}=base(2000,1200); let s=head+header(w,'美光季度利润率（GAAP）','FQ1-24至FQ3-26；盈利仍在加速，但股价开始交易未来斜率而非当期绝对值');
  const q=['FQ1-24','FQ2-24','FQ3-24','FQ4-24','FQ1-25','FQ2-25','FQ3-25','FQ4-25','FQ1-26','FQ2-26','FQ3-26'];
  const gm=[-0.7,18.5,26.9,35.3,38.4,36.8,37.7,44.7,56,74.4,84.6], om=[-23.9,3.3,10.6,19.6,25,22,23.3,32.3,45,67.6,80.4];
  const left=110, top=230, bottom=1000, chartH=720, zero=top+chartH*(95/125), scale=chartH/125;
  [-20,0,20,40,60,80].forEach(v=>{const y=zero-v*scale;s+=line(left,y,1930,y,'#D8D4CB',1)+text(92,y+7,`${v}%`,16,C.grey,400,'end')});
  s+=line(left,zero,1930,zero,C.ink,2);
  const step=158,bw=48;
  q.forEach((label,i)=>{const x=145+i*step; [[gm[i],C.gold,-27],[om[i],C.blue,27]].forEach(([v,c,dx])=>{const y=Math.min(zero,zero-v*scale), hh=Math.abs(v*scale); s+=rect(x+dx-bw/2,y,bw,hh,c,C.navy,1); s+=text(x+dx,v>=0?y-10:y+hh+22,`${v.toFixed(1)}%`,14,C.ink,600,'middle')}); s+=text(x,bottom+42,label,16,C.ink,400,'middle')});
  s+=rect(125,175,24,24,C.gold,C.navy,1)+text(160,194,'毛利率',18,C.ink,500)+rect(270,175,24,24,C.blue,C.navy,1)+text(305,194,'营业利润率',18,C.ink,500);
  s+=text(1530,250,'当前焦点：高利润能维持多久？',22,C.orange,700)+line(1690,270,1740,310,C.orange,3);
  s+=footer(w,h,'来源：Micron 8-K、FY2026 10-Q及公司财报材料。FQ3-26：GAAP毛利率84.6%，营业利润率80.4%。')+'</svg>';
  await write('02_micron_margin.png',s);
}

async function contracts(){
  const {w,h,head}=base(2100,1320);let s=head+header(w,'长期协议：行业从现货交易走向“容量预约 + 价格区间”','条款总体向供应商倾斜，但覆盖率、定价机制与可执行金额仍不可混为一谈');
  const companies=['三星','SK海力士','美光','闪迪'], terms=['期限','覆盖','定价','约束力','主要风险'];
  const data=[
    [['5年 + 滚动延期'],['目标60–70%规划产能'],['客户化地板价'],['多年保证金'],['扩产后供给释放']],
    [['多数约5年'],['10+份LTA'],['未充分披露'],['未充分披露'],['HBM/通用DRAM错配']],
    [['多数5年'],['20% DRAM、1/3 NAND','目标≥50%收入'],['地板—天花板区间'],['Take-or-pay','$22B保证金/承诺'],['天花板限制涨价弹性']],
    [['加权平均4年多','最长5年'],['FY27>50%','FY28约2/3位元'],['长期合约更偏可变价'],['$93.9B最低可执行额*'],['不能由金额倒推单位价格']]
  ];
  const x0=80,y0=220,lw=210,cw=445,rh=175;
  s+=rect(x0,y0,lw,75,C.navy);companies.forEach((c,j)=>{const x=x0+lw+j*cw;s+=rect(x,y0,cw,75,C.navy,C.bg,2)+text(x+cw/2,y0+48,c,25,C.white,700,'middle')});
  terms.forEach((term,i)=>{const y=y0+75+i*rh;s+=rect(x0,y,lw,rh,'#DCE4E8',C.white,2)+text(x0+22,y+98,term,23,C.navy,700);companies.forEach((c,j)=>{const x=x0+lw+j*cw,fill=term==='主要风险'?'#F6E7DC':(i%2? '#EEEAE1':C.white);s+=rect(x,y,cw,rh,fill,C.white,2)+lines(x+cw/2,y+68,data[j][i],20,C.ink,400,'middle',1.55)})});
  s+=text(80,1215,'核心变化：量、价和资金承诺同时进入合同；这会压低盈利波动，但不会消灭需求与供给周期。',24,C.navy,700);
  s+=footer(w,h,'来源：公司材料、美光FQ3 FY2026演示稿、高盛全球投资研究（用户提供节选）。*闪迪$93.9B为电话会/文章口径。')+'</svg>';
  await write('03_contract_terms.png',s);
}

async function math(){
  const {w,h,head}=base(1900,1080);let s=head+header(w,'为什么939亿美元不能直接推出“地板价是现价一半”','金额比较缺少承诺位元数量、年度分布和产品组合三个关键分母');
  const boxes=[[90,280,420,245,'$93.9B','合约期最低可执行总金额',C.navy],[740,280,420,245,'约$21–22B/年','按4年多机械摊分',C.gold],[1390,280,420,245,'约$42.2B/年','FQ1 FY27指引中值年化',C.navy]];
  boxes.forEach(([x,y,bw,bh,big,small,c])=>{s+=rect(x,y,bw,bh,c,'none',0,20)+text(x+bw/2,y+110,big,40,C.white,700,'middle')+text(x+bw/2,y+178,small,19,'#E8EEF1',400,'middle')});
  s+=line(535,402,705,402,C.ink,3)+text(620,380,'÷ 加权期限',19,C.ink,600,'middle')+line(1185,402,1355,402,C.orange,4)+text(1270,380,'错误比较',20,C.orange,700,'middle');
  s+=rect(180,635,1540,205,C.white,'#D3CEC4',2,22)+text(950,700,'正确的单位价格推导',28,C.navy,700,'middle')+text(950,770,'地板价 / bit ＝ 93.9B ÷ 合约期承诺总位元（还需按年份、产品和制程调整）',25,C.ink,500,'middle');
  s+=text(950,910,'结论：939亿美元能证明订单约束力，不能单独证明闪迪按半价锁死四年。',27,C.orange,700,'middle');
  s+=footer(w,h,'来源：Sandisk FY2026 Q4电话会/文章口径及公司收入指引；计算为口径辨析，不是公司盈利预测。')+'</svg>';
  await write('04_contract_math.png',s);
}

async function inventory(){
  const {w,h,head}=base(1800,1050);let s=head+header(w,'原厂库存仍低，但需要同时观察渠道与客户库存','库存周数区间；当前与正常水平为高盛/公司估算，2023峰值为约数');
  const x0=220,scale=62;
  [['DRAM',360,19.5],['NAND',650,20.2]].forEach(([name,y,peak])=>{s+=text(150,y+18,name,28,C.ink,700,'end');s+=rect(x0,y-35,4*scale,58,C.blue,C.navy,1,4)+text(x0+3.8*scale,y+4,'2–4周',20,C.white,700,'end');s+=rect(x0+4*scale,y-35,scale,58,C.gold,C.navy,1,4)+text(x0+4.5*scale,y+4,'4–5',18,C.ink,700,'middle');const px=x0+peak*scale;s+=`<polygon points="${px},${y-48} ${px+22},${y-26} ${px},${y-4} ${px-22},${y-26}" fill="${C.orange}" stroke="${C.navy}" stroke-width="2"/>`+text(px+35,y-18,'≈20周',20,C.orange,700)});
  for(let v=0;v<=22;v+=2){const x=x0+v*scale;s+=line(x,770,x,790,C.ink,1)+text(x,825,String(v),16,C.grey,400,'middle')};s+=line(x0,780,x0+22*scale,780,C.ink,2)+text(1600,825,'库存周数',18,C.grey,500,'end');
  s+=rect(250,200,24,24,C.blue,C.navy,1)+text(288,220,'当前：2–4周',19,C.ink,500)+rect(510,200,24,24,C.gold,C.navy,1)+text(548,220,'正常：4–5周',19,C.ink,500)+rect(780,200,24,24,C.orange,C.navy,1)+text(818,220,'2023峰值：约20周',19,C.ink,500);
  s+=text(900,915,'原厂低库存 ≠ 全产业链低库存。若模组厂或CSP提前囤货，需求暂停时现货仍可能先跌。',23,C.navy,700,'middle');
  s+=footer(w,h,'来源：公司数据、高盛全球投资研究（用户提供节选）。本图只表达库存制度位置，不重建未经披露的逐季精确值。')+'</svg>';
  await write('05_inventory_regime.png',s);
}

async function stage(){
  const {w,h,head}=base(1900,1060);let s=head+header(w,'这一轮存储周期走到哪里？','当前位于盈利兑现后段，并开始交易涨价二阶导与长期利润中枢');
  const stages=[['阶段1','供给紧张',['库存下降','现货先涨'],C.blue],['阶段2','盈利上修',['ASP上涨','分析师上调EPS'],C.gold],['阶段3','现金流爆发',['毛利率创纪录','长协集中签订'],C.olive],['阶段4','持续性定价',['涨价斜率放缓','估值看正常化利润'],C.orange]];
  stages.forEach((st,i)=>{const x=80+i*455,y=330,bw=375,bh=330;s+=rect(x,y,bw,bh,C.white,st[3],4,20)+text(x+26,y+55,st[0],20,st[3],700)+text(x+bw/2,y+155,st[1],31,C.ink,700,'middle')+lines(x+bw/2,y+225,st[2],21,C.grey,400,'middle',1.5);if(i<3)s+=line(x+bw+20,y+165,x+bw+65,y+165,C.ink,3)});
  s+=text(1480,270,'当前',28,C.orange,700,'middle')+line(1480,285,1480,325,C.orange,5);
  s+=text(950,800,'尚未确认下行：需要看到位元出货走弱、渠道库存上升、长协条款恶化和盈利预测连续下修。',24,C.navy,700,'middle');
  s+=footer(w,h,'来源：MIKKO Research框架。阶段划分为分析性判断，不代表精确择时信号。')+'</svg>';
  await write('06_cycle_stage.png',s);
}

async function macro(){
  const {w,h,head}=base(2000,1120);let s=head+header(w,'宏观如何传导到存储利润？','本轮需求核心来自现金流充足的CSP资本开支，但利率、能源与供给扩张决定估值和持续时间');
  const nodes=[
    [90,345,320,260,'宏观条件',['实际利率 / 美元','金融条件'],C.blue],
    [485,345,320,260,'CSP资本开支',['订单与积压','数据中心建设'],C.gold],
    [880,345,320,260,'AI存储需求',['HBM / DRAM','企业级SSD / HDD'],C.olive],
    [1275,345,320,260,'供应与长协',['洁净室约束','Take-or-pay'],C.orange],
    [1670,345,240,260,'资产定价',['盈利持续性','估值倍数'],C.navy]
  ];
  nodes.forEach((n,i)=>{const [x,y,bw,bh,hd,ls,c]=n;s+=rect(x,y,bw,bh,C.white,c,4,18)+text(x+bw/2,y+88,hd,27,C.ink,700,'middle')+lines(x+bw/2,y+155,ls,20,C.grey,400,'middle',1.55);if(i<nodes.length-1)s+=line(x+bw+20,y+130,nodes[i+1][0]-20,y+130,C.ink,4)});
  s+=text(255,720,'利率上升先压估值，未必立刻取消已签订单',20,C.blue,700,'middle');
  s+=text(870,775,'现金流融资比杠杆融资更稳健',20,C.gold,700,'middle');
  s+=text(1390,720,'长协把部分扩产风险从原厂转移给客户',20,C.orange,700,'middle');
  s+=rect(300,855,1400,120,'#EEEAE1','none',0,16)+text(1000,905,'关键非线性：若AI变现放缓 + 长端利率上行 + 2027–28供给释放同时发生，',22,C.ink,600,'middle')+text(1000,947,'存储板块会从“二阶导放缓”转为“盈利预测下修”。',24,C.orange,700,'middle');
  s+=footer(w,h,'来源：MIKKO Research宏观传导框架；公司资本开支、订单与供应信息来自企业披露。')+'</svg>';
  await write('07_macro_transmission.png',s);
}

(async()=>{for(const fn of [cover,earnings,micron,contracts,math,inventory,stage,macro]) await fn(); console.log(`charts written to ${OUT}`)})().catch(e=>{console.error(e);process.exit(1)});
