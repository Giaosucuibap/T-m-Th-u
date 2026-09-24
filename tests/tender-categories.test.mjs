import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TENDER_CATEGORIES, normalizeCategory, categoryLabel, categoryField,
  inferTenderFieldFromName, tenderFieldOf, matchesTenderCategory
} from '../lib/tender-categories.js';

test('shared choices have stable IDs and consulting subtypes map only to TV', () => {
  assert.deepEqual(TENDER_CATEGORIES.map((c) => c.value), ['', 'XL', 'TV', 'TV_DESIGN', 'TV_SUPERVISION', 'TV_SURVEY', 'TV_APPRAISAL', 'TV_PROJECT_MANAGEMENT', 'HH', 'PTV', 'HON_HOP']);
  assert.equal(normalizeCategory(' tv_design '), 'TV_DESIGN');
  assert.equal(normalizeCategory('<script>'), '');
  assert.equal(normalizeCategory(null), '');
  assert.equal(categoryField('TV_SUPERVISION'), 'TV');
  assert.equal(categoryField('HON_HOP'), 'HON_HOP');
  assert.equal(categoryField(''), '');
  assert.equal(categoryLabel('XL'), 'Xây lắp');
  assert.equal(new Set(TENDER_CATEGORIES.map((c) => c.label)).size, TENDER_CATEGORIES.length);
});

test('exact source codes override both misleading names and conflicting display labels', () => {
  const supply = { investField: 'HH', fieldRaw: 'Tư vấn', bidName: 'Mua sắm camera giám sát, thiết kế theo yêu cầu' };
  assert.equal(matchesTenderCategory(supply, 'HH'), true);
  for (const category of ['TV', 'TV_DESIGN', 'TV_SUPERVISION', 'XL']) assert.equal(matchesTenderCategory(supply, category), false, category);
  assert.equal(matchesTenderCategory({ fieldRaw: 'TV', bidName: 'Sửa chữa trường học' }, 'TV'), true);
  assert.equal(matchesTenderCategory({ fieldRaw: 'TV', bidName: 'Sửa chữa trường học' }, 'XL'), false);
  assert.equal(matchesTenderCategory({ investFieldName: 'Tư vấn', bidField: 'XL', name: 'Thi công theo thiết kế' }, 'XL'), true);
  assert.equal(matchesTenderCategory({ field: 'HON_HOP', name: 'Thiết kế, cung cấp thiết bị và xây lắp' }, 'TV_DESIGN'), false);
});

test('precise Vietnamese field labels work with raw and normalized package aliases', () => {
  for (const key of ['bidName', 'notifyName', 'packageName', 'name', 'bidPackageName']) {
    assert.equal(matchesTenderCategory({ [key]: 'Tư vấn THIẾT KẾ bản vẽ thi công', fieldRaw: 'Tư vấn' }, 'TV_DESIGN'), true, key);
  }
  for (const label of ['Hàng hóa', 'Hàng hoá', 'HANG HOA']) assert.equal(matchesTenderCategory({ fieldRaw: label, name: 'Thiết bị trường học' }, 'HH'), true);
  assert.equal(matchesTenderCategory({ fieldLabel: 'Phi tư vấn', name: 'Dịch vụ hỗ trợ' }, 'PTV'), true);
  assert.equal(matchesTenderCategory({ fieldLabel: 'Phi tư vấn', name: 'Dịch vụ hỗ trợ' }, 'TV'), false);
});

test('name inference remains separate, conservative and limited to package names', () => {
  for (const [name, field] of [
    ['Gói số 01: Xây lắp tuyến đường', 'XL'],
    ['Tư vấn giám sát thi công xây dựng', 'TV'],
    ['Gói thầu số 02: Khảo sát địa hình', 'TV'],
    ['Mua sắm camera giám sát', 'HH'],
    ['Dịch vụ phi tư vấn', 'PTV'],
    ['Dịch vụ bảo hiểm công trình', 'PTV'],
    ['Thiết kế, mua sắm và xây dựng (EPC)', 'HON_HOP'],
    ['Gói thầu số 05', ''], ['Thuê hệ thống camera giám sát', '']
  ]) assert.equal(inferTenderFieldFromName(name), field, name);
  const unknown = { name: 'Gói thầu số 05', investorName: 'Ban Quản lý dự án', projectName: 'Xây dựng trường học', rawText: 'Lĩnh vực tư vấn thiết kế' };
  for (const category of TENDER_CATEGORIES.filter((c) => c.value)) assert.equal(matchesTenderCategory(unknown, category.value), false, category.value);
  assert.equal(matchesTenderCategory(unknown, ''), true);
  assert.equal(matchesTenderCategory(null, 'XL'), false);
});

test('Vietnamese accents, punctuation and combined consulting tasks match independently', () => {
  const combined = { investField: 'TV', bidName: 'Khảo sát; tư vấn thiết kế và giám sát thi công công trình' };
  for (const category of ['TV', 'TV_DESIGN', 'TV_SUPERVISION', 'TV_SURVEY']) assert.equal(matchesTenderCategory(combined, category), true, category);
  assert.equal(matchesTenderCategory(combined, 'TV_APPRAISAL'), false);
  /* HỢP ĐỒNG MỚI (4.11.0): tên gói KHÔNG quyết định lĩnh vực gốc.
     "TU VAN THAM-DINH du toan" mà e-GP không khai lĩnh vực thì không được tự
     xếp vào Tư vấn — tên gói là chữ người ta gõ, không phải trường dữ liệu.
     Gói đó KHÔNG biến mất: cổng lọc xếp nó vào "Chưa đủ dữ liệu" (xem bài
     "gói không khai lĩnh vực" bên dưới). */
  assert.equal(matchesTenderCategory({ name: 'TU VAN THAM-DINH du toan' }, 'TV_APPRAISAL'), false);
  assert.equal(matchesTenderCategory({ field: 'TV', name: 'Tư vấn quản lý dự án đầu tư' }, 'TV_PROJECT_MANAGEMENT'), true);
  assert.equal(matchesTenderCategory({ field: 'TV', name: 'Tu van GIAM\u0020SA\u0301T thi cong' }, 'TV_SUPERVISION'), true);
});

test('word boundaries and object names do not turn unrelated tasks into consulting subtypes', () => {
  for (const [name, category] of [
    ['Tư vấn thiết kế trụ sở Ban quản lý dự án', 'TV_PROJECT_MANAGEMENT'],
    ['Tư vấn thiết kế hệ thống camera giám sát', 'TV_SUPERVISION'],
    ['Tư vấn thẩm tra thiết kế bản vẽ thi công', 'TV_DESIGN'],
    ['Tư vấn thẩm định hồ sơ thiết kế', 'TV_DESIGN'],
    ['Tư vấn phát triển phần mềm giamsat', 'TV_SUPERVISION'],
    ['Tư vấn tiền khảosát', 'TV_SURVEY'],
    ['Tư vấn bộ công cụ thiet keto', 'TV_DESIGN']
  ]) assert.equal(matchesTenderCategory({ field: 'TV', name }, category), false, name);
  assert.equal(matchesTenderCategory({ field: 'TV', name: 'Thẩm tra thiết kế hạng mục A và thiết kế hạng mục B' }, 'TV_DESIGN'), true);
  assert.equal(matchesTenderCategory({ name: 'Thi công lắp đặt hệ thống giám sát giao thông' }, 'TV_SUPERVISION'), false);
});

test('mixed plans are evaluated per child without borrowing plan-wide fields', () => {
  const plan = { name: 'Xây dựng trường học', fields: ['Xây lắp', 'Tư vấn'], investField: ['XL', 'TV'], packages: [
    { name: 'Xây lắp trường học' }, { name: 'Tư vấn giám sát thi công' }, { name: 'Gói thầu số 3' }
  ] };
  assert.equal(matchesTenderCategory(plan, 'XL'), false);
  assert.equal(matchesTenderCategory(plan, 'TV_SUPERVISION'), false);
  /* Gói con chỉ có TÊN, không khai lĩnh vực → không khớp loại nào. Tên gói
     không phải căn cứ phân loại; xem chú thích ở bài trên. */
  assert.deepEqual(plan.packages.filter((p) => matchesTenderCategory(p, 'XL')).map((p) => p.name), []);
  assert.deepEqual(plan.packages.filter((p) => matchesTenderCategory(p, 'TV_SUPERVISION')).map((p) => p.name), []);
  // Khai lĩnh vực ở CHÍNH gói con thì phân loại dứt khoát.
  const khaiRo = plan.packages.map((p, i) => ({ ...p, investField: ['XL', 'TV', 'TV'][i] }));
  assert.deepEqual(khaiRo.filter((p) => matchesTenderCategory(p, 'XL')).map((p) => p.name), ['Xây lắp trường học']);
  assert.deepEqual(khaiRo.filter((p) => matchesTenderCategory(p, 'TV_SUPERVISION')).map((p) => p.name), ['Tư vấn giám sát thi công']);
  assert.equal(matchesTenderCategory({ ...plan.packages[2], fields: plan.fields }, 'XL'), false);
  assert.equal(matchesTenderCategory({ ...plan.packages[2], investField: plan.investField }, 'TV'), false);
  assert.equal(matchesTenderCategory({ bidName: ['Xây lắp trường học'], investField: ['XL'] }, 'XL'), false);
  assert.equal(matchesTenderCategory({ name: 'Gói thầu số 3', investField: ['TV'] }, 'TV'), true);
});

test('matching is pure and ignores inherited field metadata', () => {
  const item = Object.freeze({ name: 'Tư vấn khảo sát địa hình', field: 'TV' });
  assert.equal(matchesTenderCategory(item, 'TV_SURVEY'), true);
  assert.deepEqual(item, { name: 'Tư vấn khảo sát địa hình', field: 'TV' });
  /* Lĩnh vực kế thừa qua prototype KHÔNG phải dữ liệu của bản ghi này. Đọc nó
     là mượn dữ liệu của chỗ khác rồi coi như của mình. */
  const inherited = Object.assign(Object.create({ investField: 'XL' }), { name: 'Tư vấn khảo sát địa hình' });
  assert.equal(matchesTenderCategory(inherited, 'TV_SURVEY'), false);
  assert.equal(matchesTenderCategory(inherited, 'XL'), false, 'đã đọc trường kế thừa qua prototype');
});

test('GÓI KHÔNG KHAI LĨNH VỰC không bị vứt — cổng lọc xếp vào "Chưa đủ dữ liệu"', async () => {
  /* Đây là điều khiến hợp đồng mới an toàn. Không đoán lĩnh vực từ tên gói là
     đúng, NHƯNG chỉ đúng khi gói đó vẫn hiện ra cho người dùng tự xét. Nếu nó
     lặng lẽ biến mất thì bản mới còn tệ hơn bản cũ: người đi đấu thầu mất gói
     mà không bao giờ biết mình đã mất. */
  const { passesHardFilter } = await import('../lib/hard-filter.js');
  for (const name of ['Xây lắp trường học Tân Minh', 'TVGS thi công kênh mương', 'Gói thầu số 05']) {
    const v = passesHardFilter({ bidName: name }, { category: 'XL' }, null);
    assert.equal(v.state, 'INSUFFICIENT', `"${name}" bị loại hẳn thay vì báo chưa đủ dữ liệu`);
    assert.equal(v.reason, 'insufficient-category');
  }
  // Còn khai rõ mà khác loại thì loại dứt khoát — đó mới là "ngoài tiêu chí".
  assert.equal(passesHardFilter({ bidName: 'Xây nhà', investField: 'XL' }, { category: 'TV' }, null).state, 'OUT_OF_RANGE');
});

test('MÃ LOẠI GÓI KHÔNG TỒN TẠI không được hiểu là "không lọc gì"', async () => {
  /* Một mã gõ sai, một bộ săn lưu từ bản cũ, hay một hằng số đổi tên đều rơi về
     chuỗi rỗng. Nếu chuỗi rỗng nghĩa là "không lọc", người dùng thấy bộ lọc
     đang bật trên màn hình mà nhận về TOÀN BỘ gói thầu, và tin là mình đã lọc.
     Không có dấu hiệu nào cho họ biết. */
  const goiHangHoa = { bidName: 'Mua sắm bàn ghế', investField: 'HH' };
  for (const sai of ['MS', 'TV_DESING', 'XAYLAP', 'HH2']) {
    assert.equal(matchesTenderCategory(goiHangHoa, sai), false, `mã sai "${sai}" vẫn khớp mọi gói`);
  }
  assert.equal(matchesTenderCategory(goiHangHoa, 'HH'), true, 'mã đúng phải khớp');
  assert.equal(matchesTenderCategory(goiHangHoa, ''), true, 'không chọn loại thì không lọc');

  // Và cổng lọc phải NÓI RA, chứ không lặng lẽ trả về 0 kết quả.
  const { passesHardFilter } = await import('../lib/hard-filter.js');
  const v = passesHardFilter(goiHangHoa, { category: 'TV_DESING' }, null);
  assert.equal(v.reason, 'invalid-category');
  assert.equal(v.state, 'INSUFFICIENT');
});

test('field resolution exposes unclassified packages without inventing metadata', () => {
  assert.equal(tenderFieldOf({ name: 'Gói thầu số 3' }), '');
  assert.equal(tenderFieldOf(null), '');
  assert.equal(tenderFieldOf({ name: 'Tư vấn thiết kế', fieldCode: 'HH' }), 'HH');
  /* Chỉ có TÊN thì lĩnh vực là CHƯA BIẾT, không phải 'TV'. Suy ra từ tên rồi
     trả về như một trường dữ liệu là biến phỏng đoán thành sự thật — chỗ nhận
     nó ở xa không còn phân biệt được đâu là e-GP khai, đâu là mình đoán.
     Muốn gợi ý từ tên thì gọi thẳng `inferTenderFieldFromName`, có tên hàm nói
     rõ đó là suy đoán. */
  assert.equal(tenderFieldOf({ name: 'Tư vấn thiết kế' }), '');
  assert.equal(inferTenderFieldFromName('Tư vấn thiết kế'), 'TV', 'gợi ý theo tên vẫn phải dùng được');
  assert.equal(tenderFieldOf({ name: 'Thi công trường học', packages: [{ name: 'Thi công' }], investField: 'XL' }), '');
});

test('observed native singleton-array notice remains classifiable before normalization', () => {
  // Public record observed in the fixture-free Chrome run, 2026-09-07.
  const record = {planNo: 'PL2600271824', bidName: ['Gói thầu số 01: Toàn bộ chi phí xây dựng'],
    bidPrice: [2646341557], investField: ['XL'], bidField: 'XL', notifyNo: 'IB2600486024',
    notifyVersion: '00', stepCode: 'notify-contractor-step-2-kqmt'};
  assert.equal(tenderFieldOf(record), 'XL');
  assert.equal(matchesTenderCategory(record, 'XL'), true);
  assert.equal(matchesTenderCategory(record, 'TV'), false);
  assert.deepEqual(record.bidName, ['Gói thầu số 01: Toàn bộ chi phí xây dựng']);
});

test('array-shaped notice names match consulting specialties with source-field precedence', () => {
  const record = {notifyNo: 'IB2699980001', bidName: ['Tư vấn thiết kế và giám sát thi công'], investField: ['TV']};
  for (const category of ['TV', 'TV_DESIGN', 'TV_SUPERVISION']) assert.equal(matchesTenderCategory(record, category), true, category);
  assert.equal(matchesTenderCategory({...record, investField: ['HH']}, 'TV_SUPERVISION'), false);
  assert.equal(matchesTenderCategory({notifyId: '593d55c5-27d5-44bf-b3d1-47665fca4e7a', bidName: ['Tư vấn khảo sát'], investField: ['TV']}, 'TV_SURVEY'), true);
  assert.equal(matchesTenderCategory({type: 'es-notify-contractor', bidName: ['Tư vấn khảo sát'], investField: ['TV']}, 'TV_SURVEY'), true);
});

test('notice-array support never turns a whole plan or multiple names into one classified package', () => {
  const record = {notifyNo: 'IB2699980001', bidName: ['Tư vấn giám sát'], investField: ['TV']};
  for (const plan of [
    {...record, packages: [{name: 'Tư vấn giám sát'}]},
    {...record, type: 'es-plan-project-p'},
    {...record, stepCode: 'plan-step-1'},
    {...record, bidName: ['Tư vấn giám sát', 'Thi công xây dựng']},
    {planNo: 'PL2600085770', bidName: ['Tư vấn giám sát'], investField: ['TV']},
    {notifyNo: 'undefined', notifyId: 'undefined', bidName: ['Tư vấn giám sát'], investField: ['TV']}
  ]) {
    assert.equal(tenderFieldOf(plan), '', JSON.stringify(plan));
    assert.equal(matchesTenderCategory(plan, 'TV_SUPERVISION'), false, JSON.stringify(plan));
  }
});
