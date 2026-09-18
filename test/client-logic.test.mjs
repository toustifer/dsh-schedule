import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// logic.cjs 是 CommonJS(不受 package.json "type":"module" 影响),
// 用 createRequire 引入以覆盖纯视图逻辑。
const require = createRequire(import.meta.url)
const L = require('../src/client/logic.cjs')

test('logic: addDays 跨月/跨年边界', () => {
  assert.equal(L.addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(L.addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01')
  // 闰年
  assert.equal(L.addDays('2028-02-28', 1), '2028-02-29')
})

test('logic: mondayOf 返回本周周一', () => {
  assert.equal(L.mondayOf('2026-08-17'), '2026-08-17') // 周一
  assert.equal(L.mondayOf('2026-08-23'), '2026-08-17') // 周日
  assert.equal(L.mondayOf('2026-08-22'), '2026-08-17') // 周六
})

test('logic: matches 与宿主端一致的 once/daily/weekly 展开', () => {
  const once = { recurring: 'once', date: '2026-08-20' }
  assert.equal(L.matches(once, '2026-08-20'), true)
  assert.equal(L.matches(once, '2026-08-21'), false)
  const weekly = { recurring: 'weekly', weekdays: [1, 5] }
  assert.equal(L.matches(weekly, '2026-08-17'), true) // 周一
  assert.equal(L.matches(weekly, '2026-08-21'), true) // 周五
  assert.equal(L.matches(weekly, '2026-08-19'), false)
})

test('logic: matches 认得顺延历史日期(与宿主端 store 对齐)', () => {
  // once 日程已从 8-10 顺延到 8-14,rolloverDates 记录了中间每一天
  const carried = { recurring: 'once', date: '2026-08-14', rolloverDates: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'] }
  for (const d of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']) {
    assert.equal(L.matches(carried, d), true, d + ' 应命中')
  }
  assert.equal(L.matches(carried, '2026-08-09'), false)
  // 无顺延历史的普通 once 不受影响
  assert.equal(L.matches({ recurring: 'once', date: '2026-08-14' }, '2026-08-10'), false)
})

test('logic: rowsFor 在顺延日期上给出 rollover 行', () => {
  const data = {
    items: [{ id: 'r1', title: '交报告', recurring: 'once', date: '2026-08-14', carryOver: true, rolloverDates: ['2026-08-12'] }],
    done: {},
  }
  const rows = L.rowsFor(data, '2026-08-12')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].rollover, true)
  assert.equal(rows[0].done, false)
})

test('logic: recurringLabel 文案', () => {
  assert.equal(L.recurringLabel({ recurring: 'daily' }), '每天')
  assert.equal(L.recurringLabel({ recurring: 'weekly', weekdays: [1, 3] }), '每周周一周三')
  assert.equal(L.recurringLabel({ recurring: 'weekly', weekdays: [] }), '每周')
  assert.equal(L.recurringLabel({ recurring: 'once' }), '')
})

test('logic: rowsFor 成员、完成与顺延标记', () => {
  const data = {
    items: [
      { id: 'a', title: '乙事项', recurring: 'daily', time: '' },
      { id: 'b', title: '早读', recurring: 'daily', time: '07:00' },
      { id: 'c', title: '站会', recurring: 'daily', time: '09:30' },
    ],
    done: { c: { '2026-08-17': true } },
  }
  const rows = L.rowsFor(data, '2026-08-17')
  // 排序行为由专门的排序用例覆盖(见 sortRows 用例)
  assert.equal(rows.length, 3)
  const byId = {}
  for (const r of rows) byId[r.item.id] = r
  assert.equal(byId.c.done, true)
  assert.equal(byId.b.done, false)
  assert.equal(byId.a.rollover, false)
})

test('logic: sortRows 包装行与裸日程都能正确排序', () => {
  const items = [
    { id: 'a', title: 'zzz', recurring: 'daily', time: '' },
    { id: 'b', title: '早读', recurring: 'daily', time: '07:00' },
    { id: 'c', title: '站会', recurring: 'daily', time: '9:30' }, // 一位数小时
    { id: 'd', title: '评审', recurring: 'daily', time: '10:00' },
    { id: 'e', title: 'aaa', recurring: 'daily', time: '' },
  ]
  // 裸日程数组:9:30(570 分)在 10:00(600 分)之前;无时间殿后;
  // 同为无时间按标题字典序(aaa 在 zzz 前)
  assert.deepEqual(
    items.slice().sort(L.sortRows).map((x) => x.id),
    ['b', 'c', 'd', 'e', 'a'],
  )
  // rowsFor 的包装行 { item, ... }
  const wrapped = items.map((item) => ({ item, done: false, rollover: false }))
  assert.deepEqual(wrapped.sort(L.sortRows).map((x) => x.item.id), ['b', 'c', 'd', 'e', 'a'])
})

test('logic: rowsFor 返回按 sortRows 排好序的行', () => {
  const data = {
    items: [
      { id: 'late', title: '晚班', recurring: 'daily', time: '21:00' },
      { id: 'early', title: '早班', recurring: 'daily', time: '6:00' },
      { id: 'none', title: '没定时间', recurring: 'daily' },
    ],
    done: {},
  }
  assert.deepEqual(
    L.rowsFor(data, '2026-08-17').map((r) => r.item.id),
    ['early', 'late', 'none'],
  )
})

test('logic: completedBetween 闭区间统计与 hasDoneOn/streakOf', () => {
  const data = { items: [], done: { x: { '2026-08-15': true, '2026-08-16': true }, y: { '2026-08-16': true } } }
  assert.equal(L.completedBetween(data, '2026-08-10', '2026-08-16'), 3)
  assert.equal(L.completedBetween(data, '2026-08-16', '2026-08-16'), 2)
  assert.equal(L.completedBetween(data, '2026-08-17', '2026-08-18'), 0)
  assert.equal(L.hasDoneOn(data, '2026-08-15'), true)
  assert.equal(L.hasDoneOn(data, '2026-08-17'), false)
  // 今天(8-16)没做也行:从昨天往前数 2 天
  assert.equal(L.streakOf(data, '2026-08-16'), 2)
  // 今天做了则含今天
  const data2 = { items: [], done: { z: { '2026-08-16': true, '2026-08-17': true } } }
  assert.equal(L.streakOf(data2, '2026-08-17'), 2)
})

test('logic: parseTimeBlock 支持起止区间与单点时间', () => {
  // 区间格式 "09:00-10:30"
  const b1 = L.parseTimeBlock({ time: '09:00-10:30' })
  assert.equal(b1.hasTime, true)
  assert.equal(b1.startTime, '09:00')
  assert.equal(b1.endTime, '10:30')
  assert.equal(b1.startMinutes, 540)
  assert.equal(b1.endMinutes, 630)
  assert.equal(b1.durationMinutes, 90)
  assert.equal(b1.isRange, true)

  // 显式 startTime 与 endTime 属性
  const b2 = L.parseTimeBlock({ startTime: '14:00', endTime: '15:15' })
  assert.equal(b2.hasTime, true)
  assert.equal(b2.startTime, '14:00')
  assert.equal(b2.endTime, '15:15')
  assert.equal(b2.durationMinutes, 75)
  assert.equal(b2.isRange, true)

  // 单点时间 "16:00": 默认预估 45 分钟色块
  const b3 = L.parseTimeBlock({ time: '16:00' })
  assert.equal(b3.hasTime, true)
  assert.equal(b3.startTime, '16:00')
  assert.equal(b3.endTime, '16:45')
  assert.equal(b3.durationMinutes, 45)
  assert.equal(b3.isRange, false)

  // 无时间
  const b4 = L.parseTimeBlock({ title: '无时间' })
  assert.equal(b4.hasTime, false)
  assert.equal(b4.startMinutes, null)
})

test('logic: detectTimeConflicts 重叠判定', () => {
  const rows = [
    { item: { id: '1', title: '会议A', time: '09:00-10:30' } },
    { item: { id: '2', title: '会议B', time: '10:00-11:00' } }, // 与 A 重叠
    { item: { id: '3', title: '午餐', time: '12:00-13:00' } },   // 独立
  ]
  const map = L.detectTimeConflicts(rows)
  assert.equal(map['1'].length, 1)
  assert.equal(map['1'][0].id, '2')
  assert.equal(map['2'].length, 1)
  assert.equal(map['2'][0].id, '1')
  assert.equal(map['3'].length, 0)
})

test('logic: computeTimeSchedule 插入空闲段与按序排列', () => {
  const rows = [
    { item: { id: 't2', title: '下午评审', time: '14:00-15:00' } },
    { item: { id: 't1', title: '晨会', time: '09:00-10:00' } },
    { item: { id: 'none', title: '无排期待办' } },
  ]
  const schedule = L.computeTimeSchedule(rows, { startHour: 9, endHour: 18 })
  assert.equal(schedule.unscheduled.length, 1)
  assert.equal(schedule.unscheduled[0].item.id, 'none')

  // 节点顺序应为: 晨会 (9:00-10:00) -> 空闲段 (10:00-14:00 4小时) -> 下午评审 (14:00-15:00) -> 空闲段 (15:00-18:00)
  assert.equal(schedule.nodes.length, 4)
  assert.equal(schedule.nodes[0].type, 'task')
  assert.equal(schedule.nodes[0].item.id, 't1')

  assert.equal(schedule.nodes[1].type, 'free')
  assert.equal(schedule.nodes[1].startTime, '10:00')
  assert.equal(schedule.nodes[1].endTime, '14:00')
  assert.equal(schedule.nodes[1].durationMinutes, 240)

  assert.equal(schedule.nodes[2].type, 'task')
  assert.equal(schedule.nodes[2].item.id, 't2')

  assert.equal(schedule.nodes[3].type, 'free')
  assert.equal(schedule.nodes[3].startTime, '15:00')
  assert.equal(schedule.nodes[3].endTime, '18:00')

  assert.equal(schedule.stats.conflictCount, 0)
  assert.equal(schedule.stats.totalScheduled, 2)
  assert.equal(schedule.stats.totalUnscheduled, 1)
})

test('logic: getCurrentMinutes 解析当前系统分钟数与特定 Date', () => {
  // 传入特定 Date: 15:23 -> 15 * 60 + 23 = 923
  const d1 = new Date(2026, 7, 20, 15, 23, 0)
  assert.equal(L.getCurrentMinutes(d1), 923)

  // 00:05 -> 5
  const d2 = new Date(2026, 7, 20, 0, 5, 0)
  assert.equal(L.getCurrentMinutes(d2), 5)

  // 缺省参数返回当前系统合法分钟数 (0 <= m < 1440)
  const now = L.getCurrentMinutes()
  assert.equal(typeof now, 'number')
  assert.equal(now >= 0 && now < 1440, true)
})

test('logic: getOverdueMinutes 计算单点与区间任务的逾期时长', () => {
  // 1. 单点时间: 14:00 (840)
  const singleTask = { id: 's1', title: '需求对齐', time: '14:00' }
  // 当前 14:23 (863): 逾期 863 - 840 = 23 分钟
  assert.equal(L.getOverdueMinutes(singleTask, 863), 23)
  // 当前 13:50 (830): 尚未逾期
  assert.equal(L.getOverdueMinutes(singleTask, 830), 0)
  // 当前刚好 14:00: 0
  assert.equal(L.getOverdueMinutes(singleTask, 840), 0)

  // 2. 时段区间: 14:00-15:00 (840-900)
  const rangeTask = { id: 'r1', title: '架构评审', time: '14:00-15:00' }
  // 当前 14:23 (863): 处于时段内, 不逾期
  assert.equal(L.getOverdueMinutes(rangeTask, 863), 0)
  // 当前 15:23 (923): 超过时段结束时间 15:00 (900) 23 分钟
  assert.equal(L.getOverdueMinutes(rangeTask, 923), 23)

  // 3. 已完成任务 (done === true): 不算逾期
  assert.equal(L.getOverdueMinutes({ ...singleTask, done: true }, 863), 0)
  // 包装行 { item, done: true }
  assert.equal(L.getOverdueMinutes({ item: singleTask, done: true }, 863), 0)
  // 包装行 { item, done: false }
  assert.equal(L.getOverdueMinutes({ item: singleTask, done: false }, 863), 23)

  // 4. 无时间任务
  assert.equal(L.getOverdueMinutes({ id: 'none', title: '看文章' }, 863), 0)
})

test('logic: formatOverdueText 格式化逾期友好文本', () => {
  assert.equal(L.formatOverdueText(23), '⚠️ 已逾期 23分钟')
  assert.equal(L.formatOverdueText(75), '⚠️ 已逾期 1小时15分')
  assert.equal(L.formatOverdueText(0), '')
  assert.equal(L.formatOverdueText(-10), '')
  assert.equal(L.formatOverdueText(null), '')
})

test('logic: injectNowNode 智能插入 Now 游标节点与拆分空闲段', () => {
  const nodes = [
    { type: 'task', block: { startMinutes: 540, endMinutes: 600 } }, // 09:00-10:00
    { type: 'free', startTime: '10:00', endTime: '14:00', startMinutes: 600, endMinutes: 840, durationMinutes: 240, durationText: '4小时' },
    { type: 'task', block: { startMinutes: 840, endMinutes: 900 } }, // 14:00-15:00
  ]

  // 当 now 在 11:30 (690, 落在 10:00-14:00 空闲段中间):
  // 拆分成 10:00-11:30 free (90分) -> now (11:30) -> 11:30-14:00 free (150分)
  const result = L.injectNowNode(nodes, 690)
  assert.equal(result.length, 5)
  assert.equal(result[0].type, 'task')

  assert.equal(result[1].type, 'free')
  assert.equal(result[1].startTime, '10:00')
  assert.equal(result[1].endTime, '11:30')
  assert.equal(result[1].durationMinutes, 90)

  assert.equal(result[2].type, 'now')
  assert.equal(result[2].time, '11:30')
  assert.equal(result[2].label, '11:30 现在')

  assert.equal(result[3].type, 'free')
  assert.equal(result[3].startTime, '11:30')
  assert.equal(result[3].endTime, '14:00')
  assert.equal(result[3].durationMinutes, 150)

  assert.equal(result[4].type, 'task')

  // 空列表
  const emptyRes = L.injectNowNode([], 923)
  assert.equal(emptyRes.length, 1)
  assert.equal(emptyRes[0].type, 'now')
  assert.equal(emptyRes[0].time, '15:23')
  assert.equal(emptyRes[0].label, '15:23 现在')
})

test('logic: computeTimeSchedule 集成 nowMinutes 动态游标', () => {
  const rows = [
    { item: { id: 't1', title: '下午评审', time: '14:00-15:00' } },
  ]
  // 传入 nowMinutes = 15:23 (923)
  const schedule = L.computeTimeSchedule(rows, { startHour: 10, endHour: 18, nowMinutes: 923 })
  const nowNode = schedule.nodes.find((n) => n.type === 'now')
  assert.ok(nowNode, '应生成 now 节点')
  assert.equal(nowNode.time, '15:23')
  assert.equal(nowNode.label, '15:23 现在')

  // 不传 nowMinutes 则不产生 now 节点
  const normalSched = L.computeTimeSchedule(rows, { startHour: 10, endHour: 18 })
  assert.equal(normalSched.nodes.some((n) => n.type === 'now'), false)
})

test('logic: 吸附排程后待办从 unscheduled 进入时间轴节点并重新分割空闲段', () => {
  const t1 = { id: 't1', title: '早晨例会', time: '09:00-10:00' }
  const t2 = { id: 't2', title: '待安排的任务' } // 无时间

  const rowsBefore = [{ item: t1 }, { item: t2 }]
  const sBefore = L.computeTimeSchedule(rowsBefore, { startHour: 9, endHour: 18 })

  // 排程前: t2 在 unscheduled
  assert.equal(sBefore.unscheduled.length, 1)
  assert.equal(sBefore.unscheduled[0].item.id, 't2')

  // 空闲段从 10:00 到 18:00
  const freeNode = sBefore.nodes.find((n) => n.type === 'free')
  assert.ok(freeNode)
  assert.equal(freeNode.startTime, '10:00')
  assert.equal(freeNode.endTime, '18:00')

  // 模拟吸附到空闲段起点 10:00
  const t2Scheduled = { ...t2, startTime: freeNode.startTime, time: freeNode.startTime }
  const rowsAfter = [{ item: t1 }, { item: t2Scheduled }]
  const sAfter = L.computeTimeSchedule(rowsAfter, { startHour: 9, endHour: 18 })

  // 排程后: unscheduled 为空
  assert.equal(sAfter.unscheduled.length, 0)

  // t2 出现在 nodes 中，单点时间默认 45 分钟 (10:00-10:45)
  const t2Node = sAfter.nodes.find((n) => n.item && n.item.id === 't2')
  assert.ok(t2Node)
  assert.equal(t2Node.block.startTime, '10:00')
  assert.equal(t2Node.block.endTime, '10:45')

  // 后续空闲段被截为 10:45 - 18:00
  const nextFree = sAfter.nodes.find((n) => n.type === 'free')
  assert.ok(nextFree)
  assert.equal(nextFree.startTime, '10:45')
  assert.equal(nextFree.endTime, '18:00')
})

test('logic: calculateQuickAdjust 快捷微调延期计算 (+15m / +30m)', () => {
  // 1. 原本已有区间 [10:00, 10:30]
  const rangeBlock = L.parseTimeBlock({ time: '10:00 - 10:30' })
  assert.equal(rangeBlock.isRange, true)
  const adj15 = L.calculateQuickAdjust(rangeBlock, 15)
  assert.equal(adj15.newEndTime, '10:45')
  assert.equal(adj15.newTimeStr, '10:00-10:45')

  const adj30 = L.calculateQuickAdjust(rangeBlock, 30)
  assert.equal(adj30.newEndTime, '11:00')
  assert.equal(adj30.newTimeStr, '10:00-11:00')

  // 2. 原本只有单点时间 14:00 (默认预估 45m 为 14:45)
  const singleBlock = L.parseTimeBlock({ time: '14:00' })
  assert.equal(singleBlock.isRange, false)
  // +15m: 14:00 + (45 + 15) = 15:00
  const singleAdj15 = L.calculateQuickAdjust(singleBlock, 15)
  assert.equal(singleAdj15.newEndTime, '15:00')
  assert.equal(singleAdj15.newTimeStr, '14:00-15:00')

  // +30m: 14:00 + (45 + 30) = 15:15
  const singleAdj30 = L.calculateQuickAdjust(singleBlock, 30)
  assert.equal(singleAdj30.newEndTime, '15:15')
  assert.equal(singleAdj30.newTimeStr, '14:00-15:15')

  // 3. 无时间任务
  const noneBlock = L.parseTimeBlock({ time: '' })
  assert.equal(L.calculateQuickAdjust(noneBlock, 15), null)
})

test('logic: 快捷延期微调后若发生时间交叠，自动触发下游冲突标记', () => {
  // 任务 A 原本 09:00 - 09:30，任务 B 10:00 - 11:00 (原本不冲突)
  const tA = { id: 'a', title: '晨会', time: '09:00 - 09:30', recurring: 'daily' }
  const tB = { id: 'b', title: '技术评审', time: '10:00 - 11:00', recurring: 'daily' }
  const rowsInitial = [{ item: tA }, { item: tB }]
  const schedInitial = L.computeTimeSchedule(rowsInitial, { startHour: 8, endHour: 18 })
  assert.equal(schedInitial.stats.conflictCount, 0)

  // 任务 A 延期 45 分钟，变为 09:00 - 10:15
  const blockA = L.parseTimeBlock(tA)
  const adj = L.calculateQuickAdjust(blockA, 45) // 延期 45m 到 10:15
  assert.equal(adj.newEndTime, '10:15')

  const tAUpdated = { ...tA, time: adj.newTimeStr, endTime: adj.newEndTime }
  const rowsAfter = [{ item: tAUpdated }, { item: tB }]
  const schedAfter = L.computeTimeSchedule(rowsAfter, { startHour: 8, endHour: 18 })

  // 产生冲突：A 和 B 双方均被标记冲突状态
  assert.equal(schedAfter.stats.conflictCount, 2)
  const nodeA = schedAfter.nodes.find((n) => n.item && n.item.id === 'a')
  const nodeB = schedAfter.nodes.find((n) => n.item && n.item.id === 'b')
  assert.ok(nodeA.conflicts.length > 0)
  assert.equal(nodeA.conflicts[0].id, 'b')
  assert.ok(nodeB.conflicts.length > 0)
  assert.equal(nodeB.conflicts[0].id, 'a')
})

test('logic: calculateCardMove 保持卡片原有时长并在 free 空闲时段精准对齐', () => {
  // 原卡片时长 90 分钟 (10:00 - 11:30)
  const moving = { id: 'm1', title: '深度阅读', startTime: '10:00', endTime: '11:30' }
  const freeNode = {
    type: 'free',
    startTime: '14:00',
    endTime: '17:00',
    startMinutes: 14 * 60,
    endMinutes: 17 * 60,
    durationMinutes: 180,
  }

  // 移动到空闲时段起点：起始对齐 14:00，结束时间 = 14:00 + 90m = 15:30
  const res = L.calculateCardMove(moving, freeNode)
  assert.equal(res.startTime, '14:00')
  assert.equal(res.endTime, '15:30')
  assert.equal(res.time, '14:00-15:30')
  assert.equal(res.durationMinutes, 90)

  // 带有 offsetMinutes (例如在空闲段内向下拖动 45 分钟)：起始 14:45，结束 16:15
  const resOffset = L.calculateCardMove(moving, freeNode, { offsetMinutes: 45 })
  assert.equal(resOffset.startTime, '14:45')
  assert.equal(resOffset.endTime, '16:15')
  assert.equal(resOffset.time, '14:45-16:15')
  assert.equal(resOffset.durationMinutes, 90)
})

test('logic: calculateCardMove 拖到任务上方(before)与下方(after)的时序推导与顺延', () => {
  const moving = { id: 'm1', title: '撰写文档', startTime: '09:00', endTime: '10:00' } // 60 分钟
  const targetTask = {
    type: 'task',
    item: { id: 't1', title: '组会' },
    block: {
      hasTime: true,
      startTime: '11:00',
      endTime: '12:30',
      startMinutes: 11 * 60,
      endMinutes: 12 * 60 + 30,
      durationMinutes: 90,
    },
  }

  // 1. 拖到组会之后 (position: 'after'，默认)：新起点 = 目标 endTime (12:30)，时长 60m -> 13:30
  const resAfter = L.calculateCardMove(moving, targetTask, { position: 'after' })
  assert.equal(resAfter.startTime, '12:30')
  assert.equal(resAfter.endTime, '13:30')
  assert.equal(resAfter.time, '12:30-13:30')
  assert.equal(resAfter.durationMinutes, 60)

  // 2. 拖到组会之前 (position: 'before')：新终点 = 目标 startTime (11:00)，时长 60m -> 10:00 - 11:00
  const resBefore = L.calculateCardMove(moving, targetTask, { position: 'before' })
  assert.equal(resBefore.startTime, '10:00')
  assert.equal(resBefore.endTime, '11:00')
  assert.equal(resBefore.time, '10:00-11:00')
  assert.equal(resBefore.durationMinutes, 60)
})

test('logic: calculateCardMove 无排期未定时任务默认 45 分钟并支持 autoShrink 与 snap', () => {
  // 无时间任务，默认 45 分钟
  const unassigned = { id: 'u1', title: '买牛奶', recurring: 'once' }
  const smallFree = {
    type: 'free',
    startTime: '16:00',
    endTime: '16:30',
    startMinutes: 16 * 60,
    endMinutes: 16 * 60 + 30,
    durationMinutes: 30,
  }

  // 默认不 shrink: 保持 45 分钟 -> 16:00-16:45
  const resDefault = L.calculateCardMove(unassigned, smallFree)
  assert.equal(resDefault.startTime, '16:00')
  assert.equal(resDefault.endTime, '16:45')
  assert.equal(resDefault.durationMinutes, 45)

  // 开启 autoShrink: 空间只有 30m，自适应缩为 30m -> 16:00-16:30
  const resShrink = L.calculateCardMove(unassigned, smallFree, { autoShrink: true })
  assert.equal(resShrink.startTime, '16:00')
  assert.equal(resShrink.endTime, '16:30')
  assert.equal(resShrink.durationMinutes, 30)

  // 测试网格吸附 snapMinutes: 15
  // 给定目标分钟 10:07 (607m)，吸附后到 10:00 (600m)
  const resSnap1 = L.calculateCardMove(unassigned, null, { targetMinutes: 607, snapMinutes: 15 })
  assert.equal(resSnap1.startTime, '10:00')
  assert.equal(resSnap1.endTime, '10:45')

  // 给定目标分钟 10:08 (608m)，吸附后到 10:15 (615m)
  const resSnap2 = L.calculateCardMove(unassigned, null, { targetMinutes: 608, snapMinutes: 15 })
  assert.equal(resSnap2.startTime, '10:15')
  assert.equal(resSnap2.endTime, '11:00')
})

test('logic: calculateCardMove 跨天与上下极值边界保护', () => {
  const moving = { id: 'm1', title: '长跑', startTime: '08:00', endTime: '09:00' } // 60 分钟

  // 1. 上移到极早时刻 (目标任务在 00:30，向上拖 60 分钟)，不应越界为负数，最低为 00:00
  const earlyTask = {
    type: 'task',
    block: { startTime: '00:30', endTime: '01:00', startMinutes: 30, endMinutes: 60, durationMinutes: 30 },
  }
  const resEarly = L.calculateCardMove(moving, earlyTask, { position: 'before' })
  assert.equal(resEarly.startTime, '00:00')
  assert.equal(resEarly.endTime, '01:00')
  assert.equal(resEarly.startMinutes, 0)

  // 2. 下移到夜晚极晚时刻 (目标任务在 23:30 结束，向后排 60 分钟)，不应溢出超过 23:59
  const lateTask = {
    type: 'task',
    block: { startTime: '23:00', endTime: '23:30', startMinutes: 23 * 60, endMinutes: 23 * 60 + 30, durationMinutes: 30 },
  }
  const resLate = L.calculateCardMove(moving, lateTask, { position: 'after' })
  assert.equal(resLate.startTime, '23:30')
  assert.equal(resLate.endTime, '23:59') // clamped to 1439
})

test('logic: computeDropTime 根据屏幕指针 Y 坐标与时间轴视口精确定位落点', () => {
  // 构建两个任务与中间的空闲段
  // 09:00 - 10:00 (task1)
  // 10:00 - 14:00 (free)
  // 14:00 - 15:00 (task2)
  const rows = [
    { item: { id: 't1', title: '任务一', startTime: '09:00', endTime: '10:00', time: '09:00-10:00' } },
    { item: { id: 't2', title: '任务二', startTime: '14:00', endTime: '15:00', time: '14:00-15:00' } },
  ]
  const sched = L.computeTimeSchedule(rows, { startHour: 9, endHour: 18 })
  const movingItem = { id: 'm1', title: '待排项目', durationMinutes: 60 }

  // 假定时间轴视口容器：top = 100, height = 540 (对应 9:00 到 18:00，共 9 小时 = 540 分钟，每像素 1 分钟)
  const axisRect = {
    top: 100,
    height: 540,
    startMinutes: 9 * 60,  // 540
    endMinutes: 18 * 60,    // 1080
  }

  // 1. 指针拖动到 Y = 100 + 300 = 400 (对应 9:00 + 300m = 14:00，即 task2 开始处的前半段)
  // 落入 task2 上半段 -> 判定为 before task2，新时间为 13:00 - 14:00
  const dropNearTask2 = L.computeDropTime(sched.nodes, 400, axisRect, movingItem)
  assert.ok(dropNearTask2.targetNode)
  assert.equal(dropNearTask2.position, 'before')
  assert.equal(dropNearTask2.startTime, '13:00')
  assert.equal(dropNearTask2.endTime, '14:00')

  // 2. 指针拖动到 Y = 100 + 120 = 220 (对应 9:00 + 120m = 11:00，落入 10:00 - 14:00 的 free 时段)
  // 对齐该空闲段起点 10:00 -> 保持时长 60m 得到 10:00 - 11:00
  const dropInFree = L.computeDropTime(sched.nodes, 220, axisRect, movingItem)
  assert.ok(dropInFree.targetNode)
  assert.equal(dropInFree.targetNode.type, 'free')
  assert.equal(dropInFree.startTime, '10:00')
  assert.equal(dropInFree.endTime, '11:00')
})

test('logic: timeRulerShift 基础滑移（正向延后与反向提前）保持时长不变', () => {
  const item = { id: 't1', title: '撰写周报', time: '10:00-11:00' } // 60分钟
  // 1. 正向滑移 +15 分钟
  const res1 = L.timeRulerShift(item, 15)
  assert.equal(res1.startTime, '10:15')
  assert.equal(res1.endTime, '11:15')
  assert.equal(res1.time, '10:15-11:15')
  assert.equal(res1.durationMinutes, 60)
  assert.equal(res1.deltaMinutes, 15)

  // 2. 反向滑移 -30 分钟
  const res2 = L.timeRulerShift(item, -30)
  assert.equal(res2.startTime, '09:30')
  assert.equal(res2.endTime, '10:30')
  assert.equal(res2.time, '09:30-10:30')
  assert.equal(res2.durationMinutes, 60)
  assert.equal(res2.deltaMinutes, -30)

  // 3. 包装行对象 { item: ... } 兼容
  const wrapped = { item: { id: 't1', title: '撰写周报', time: '10:00-11:00' } }
  const res3 = L.timeRulerShift(wrapped, 20)
  assert.equal(res3.startTime, '10:20')
  assert.equal(res3.endTime, '11:20')
})

test('logic: timeRulerToMinutes 直接滑移定位到目标分钟数', () => {
  const item = { id: 't2', title: '团队会议', startTime: '14:00', endTime: '15:30', time: '14:00-15:30' } // 90分钟
  // 滑移到 16:00 (960 分钟)
  const res = L.timeRulerToMinutes(item, 16 * 60)
  assert.equal(res.startTime, '16:00')
  assert.equal(res.endTime, '17:30')
  assert.equal(res.time, '16:00-17:30')
  assert.equal(res.startMinutes, 960)
  assert.equal(res.endMinutes, 1050)
  assert.equal(res.durationMinutes, 90)

  // 单点时间 (默认 45 分钟) 定位
  const singleItem = { id: 't3', title: '闪电沟通', time: '09:00' }
  const resSingle = L.timeRulerToMinutes(singleItem, 10 * 60 + 30) // 10:30 (630)
  assert.equal(resSingle.startTime, '10:30')
  assert.equal(resSingle.endTime, '11:15')
  assert.equal(resSingle.durationMinutes, 45)
})

test('logic: timeRulerShift 5 分钟与 15 分钟吸附步长 (snapMinutes)', () => {
  const item = { id: 't1', title: '日常对齐', time: '10:00-10:45' } // 45分钟

  // 1. 5 分钟吸附: +12 分钟 (10:12) -> 吸附至 10:10
  const res5a = L.timeRulerShift(item, 12, { snapMinutes: 5 })
  assert.equal(res5a.startTime, '10:10')
  assert.equal(res5a.endTime, '10:55')

  // 2. 5 分钟吸附: +13 分钟 (10:13) -> 吸附至 10:15
  const res5b = L.timeRulerShift(item, 13, { snapMinutes: 5 })
  assert.equal(res5b.startTime, '10:15')
  assert.equal(res5b.endTime, '11:00')

  // 3. 15 分钟吸附: +17 分钟 (10:17) -> 吸附至 10:15
  const res15a = L.timeRulerShift(item, 17, { snapMinutes: 15 })
  assert.equal(res15a.startTime, '10:15')
  assert.equal(res15a.endTime, '11:00')

  // 4. 15 分钟吸附: +25 分钟 (10:25) -> 吸附至 10:30
  const res15b = L.timeRulerShift(item, 25, { snapMinutes: 15 })
  assert.equal(res15b.startTime, '10:30')
  assert.equal(res15b.endTime, '11:15')
})

test('logic: timeRulerShift 跨天与上下极值安全边界限制 (00:00 - 23:59)', () => {
  const morningTask = { id: 'm1', title: '早起打卡', time: '00:15-00:45' } // 30分钟
  // 向上大幅滑移 -60 分钟 -> 触及下限 00:00
  const resUnder = L.timeRulerShift(morningTask, -60)
  assert.equal(resUnder.startTime, '00:00')
  assert.equal(resUnder.endTime, '00:30')
  assert.equal(resUnder.startMinutes, 0)
  assert.equal(resUnder.endMinutes, 30)

  const nightTask = { id: 'n1', title: '晚班值守', time: '22:00-23:30' } // 90分钟
  // 向下大幅滑移 +120 分钟 -> 触及当天 24:00 (1440) 上限, 启动 clampToDay 保护
  const resOver = L.timeRulerShift(nightTask, 120, { clampToDay: true })
  // 90 分钟任务最晚只能从 22:30 开始, 24:00 结束
  assert.equal(resOver.startTime, '22:30')
  assert.equal(resOver.endTime, '23:59') // clamped to 1439
  assert.equal(resOver.startMinutes, 1350)
  assert.equal(resOver.durationMinutes, 90)
})

test('logic: timeRulerShift cascade: true 级联顺延后续重叠任务 (Domino 效应)', () => {
  const items = [
    { id: 'a', title: '模块需求评审', time: '09:00-10:00' }, // 60m
    { id: 'b', title: '架构方案讨论', time: '10:00-11:00' }, // 60m
    { id: 'c', title: '代码提交与合并', time: '11:15-12:00' }, // 45m
    { id: 'd', title: '下午茶休息', time: '15:00-15:30' },   // 远端任务不受影响
  ]

  // A 延后 45 分钟 -> A 变为 09:45 - 10:45
  // B 原 10:00 开始, 与 A (结束于 10:45) 发生重叠, 顺延至 10:45 - 11:45
  // C 原 11:15 开始, 与 B (结束于 11:45) 发生重叠, 顺延至 11:45 - 12:30
  // D 原 15:00 开始, 远晚于 12:30, 不受影响
  const res = L.timeRulerShift(items[0], 45, { cascade: true, items })

  assert.equal(res.startTime, '09:45')
  assert.equal(res.endTime, '10:45')
  assert.equal(res.cascaded.length, 2)

  // 顺延的第一个任务 B
  assert.equal(res.cascaded[0].item.id, 'b')
  assert.equal(res.cascaded[0].startTime, '10:45')
  assert.equal(res.cascaded[0].endTime, '11:45')
  assert.equal(res.cascaded[0].durationMinutes, 60)

  // 顺延的第二个任务 C
  assert.equal(res.cascaded[1].item.id, 'c')
  assert.equal(res.cascaded[1].startTime, '11:45')
  assert.equal(res.cascaded[1].endTime, '12:30')
  assert.equal(res.cascaded[1].durationMinutes, 45)

  // updates 数组包含 A, B, C
  assert.equal(res.updates.length, 3)
  assert.equal(res.updates[0].item.id, 'a')
  assert.equal(res.updates[1].item.id, 'b')
  assert.equal(res.updates[2].item.id, 'c')

  // 若 cascade: false, 即使重叠也不顺延后续
  const resNoCascade = L.timeRulerShift(items[0], 45, { cascade: false, items })
  assert.equal(resNoCascade.cascaded.length, 0)
  assert.equal(resNoCascade.updates.length, 1)
})

test('logic: timeRulerShift cascade 与 snapMinutes 组合时智能刻度向上吸附', () => {
  const items = [
    { id: 't1', title: '任务一', time: '10:00-10:20' }, // 20m, 结束于 10:20
    { id: 't2', title: '任务二', time: '10:15-11:00' }, // 45m
  ]
  // 顺延 t1 到 10:05-10:25 (结束于 10:25)
  // snapMinutes: 15, t2 原 10:15 被碰撞, 顺延起点 10:25 向上吸附到 10:30 (避免 10:15 产生倒退重叠)
  const res = L.timeRulerShift(items[0], 5, { cascade: true, snapMinutes: 15, items })
  assert.equal(res.cascaded.length, 1)
  assert.equal(res.cascaded[0].startTime, '10:30')
  assert.equal(res.cascaded[0].endTime, '11:15')
})

test('logic: timeRulerShift(items, baseTimeOrDelta, options) 批量数组模式与 targetId / 字符串基准', () => {
  const items = [
    { id: 'task-1', title: '任务一', time: '09:00-10:00' },
    { id: 'task-2', title: '任务二', time: '10:00-11:00' },
  ]
  // 第一参数直接传 items 数组, baseTime 传 "09:30" 字符串, 指定 targetId 为 task-1
  const res = L.timeRulerShift(items, '09:30', { targetId: 'task-1', cascade: true })
  assert.equal(res.startTime, '09:30')
  assert.equal(res.endTime, '10:30')
  assert.equal(res.cascaded.length, 1)
  assert.equal(res.cascaded[0].item.id, 'task-2')
  assert.equal(res.cascaded[0].startTime, '10:30')
  assert.equal(res.cascaded[0].endTime, '11:30')

  // 返回的 items 包含全部更新后的对象
  assert.equal(res.items.length, 2)
  assert.equal(res.items[0].time, '09:30-10:30')
  assert.equal(res.items[1].time, '10:30-11:30')
})

test('logic: timeRulerShift 与 timeRulerToMinutes 处理无排期待办项', () => {
  const unscheduled = { id: 'u1', title: '待排期事项' } // 无 time
  // 直接定位到 11:00 (660 分钟)
  const res = L.timeRulerToMinutes(unscheduled, 660)
  assert.equal(res.startTime, '11:00')
  assert.equal(res.endTime, '11:45') // 默认 45 分钟
  assert.equal(res.durationMinutes, 45)
  assert.equal(res.time, '11:00-11:45')
})



