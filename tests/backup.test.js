import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSafeBackupState,
  safeRunForBackup,
  safeTemplateForBackup
} from '../lib/backup.js';
import { DEFAULT_SETTINGS } from '../lib/core.js';

const SENTINEL = 'NEVER_EXPORT_THIS_SENTINEL_7f4c2d';
const SEARCH_URL =
  'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/smart/search';

test('safe backup removes sentinels from settings, records, URLs, runs and JSON template bodies', () => {
  const state = {
    settings: {
      ...DEFAULT_SETTINGS,
      requirementText: 'Công trình thủy lợi',
      telegramBotToken: SENTINEL,
      telegramChatId: SENTINEL,
      futureApiKey: SENTINEL
    },
    tenders: [{
      key: 'IB2600000001::00',
      notifyNo: 'IB2600000001',
      bidName: 'Nâng cấp kênh',
      price: 5_000_000_000,
      detailUrl: `https://muasamcong.mpi.gov.vn/detail?access_token=${SENTINEL}&render=detail`,
      sourcePageUrl: `https://muasamcong.mpi.gov.vn/search?sessionId=${SENTINEL}&render=search`,
      decisionNote: `authorization: ${SENTINEL}`,
      rawText: SENTINEL,
      futureSecret: SENTINEL
    }],
    runs: [{
      id: 'run-1',
      mode: 'manual',
      status: 'PARTIAL',
      message: `cookie=${SENTINEL}`,
      queue: [{ authorization: SENTINEL }]
    }],
    participations: [{
      key: 'IB2600000001::0100109106',
      taxCode: '0100109106',
      contractorName: 'Nhà thầu A',
      detailUrl: `https://muasamcong.mpi.gov.vn/result?jwt=${SENTINEL}&view=public`,
      privateToken: SENTINEL
    }],
    activeRun: { id: 'live', request: SENTINEL },
    telegramLog: [{ body: SENTINEL }],
    requestCache: { value: SENTINEL }
  };
  const template = {
    url: `${SEARCH_URL}?token=${SENTINEL}&page=1`,
    method: 'POST',
    body: JSON.stringify([{
      query: [
        { index: 'es-contractor-selection', keyWord: 'kênh mương' },
        { fieldName: 'captchaToken', fieldValues: [SENTINEL] }
      ],
      csrfToken: SENTINEL,
      publicValue: 7
    }]),
    sourcePageUrl: `https://muasamcong.mpi.gov.vn/search?session=${SENTINEL}&render=search`
  };

  const backup = buildSafeBackupState(
    state,
    { template, templates: [template], lastTemplate: template },
    DEFAULT_SETTINGS
  );
  const serialized = JSON.stringify(backup);

  assert.doesNotMatch(serialized, new RegExp(SENTINEL));
  assert.equal(backup.settings.requirementText, 'Công trình thủy lợi');
  assert.equal('telegramBotToken' in backup.settings, false);
  assert.equal('telegramChatId' in backup.settings, false);
  assert.equal('futureApiKey' in backup.settings, false);
  assert.equal('rawText' in backup.tenders[0], false);
  assert.equal('futureSecret' in backup.tenders[0], false);
  assert.equal(new URL(backup.tenders[0].detailUrl).searchParams.has('access_token'), false);
  assert.equal(new URL(backup.tenders[0].detailUrl).searchParams.get('render'), 'detail');
  assert.equal('queue' in backup.runs[0], false);
  assert.equal(backup.runs[0].status, 'PARTIAL');
  assert.equal('privateToken' in backup.participations[0], false);
  assert.equal('activeRun' in backup, false);
  assert.equal('telegramLog' in backup, false);
  assert.equal('requestCache' in backup, false);

  const parsedBody = JSON.parse(backup.template.body);
  assert.deepEqual(parsedBody[0].query, [
    { index: 'es-contractor-selection', keyWord: 'kênh mương' }
  ]);
  assert.equal(parsedBody[0].publicValue, 7);
  assert.equal('csrfToken' in parsedBody[0], false);
});

test('a representative maximum-record backup preserves records and stays below the 30 MB import cap', () => {
  const tenders = Array.from({ length: 10_000 }, (_, i) => ({
    key: `IB26${String(i).padStart(8, '0')}::00`,
    notifyNo: `IB26${String(i).padStart(8, '0')}`,
    bidName: `Gói thầu ${i}`,
    projectName: `Dự án hạ tầng ${i}`,
    location: `Tỉnh mẫu ${i % 34}`,
    investorName: `Chủ đầu tư ${i % 500}`,
    price: i * 1_000_000,
    decisionNote: `Ghi chú nghiệp vụ ${i}`,
    detailUrl: `https://muasamcong.mpi.gov.vn/detail/${i}`
  }));
  const participations = Array.from({ length: 30_000 }, (_, i) => ({
    key: `participation-${i}`,
    taxCode: String(10_000_000_000 + i),
    contractorName: `Nhà thầu ${i}`,
    notifyNo: tenders[i % tenders.length].notifyNo,
    role: i % 5 === 0 ? 'Liên danh' : 'Độc lập',
    detailUrl: `https://muasamcong.mpi.gov.vn/result/${i}`
  }));

  const backup = buildSafeBackupState(
    { settings: DEFAULT_SETTINGS, tenders, participations, runs: [] },
    {},
    DEFAULT_SETTINGS
  );

  assert.equal(backup.tenders.length, tenders.length);
  assert.equal(backup.tenders.at(-1).key, tenders.at(-1).key);
  assert.equal(backup.participations.length, participations.length);
  assert.equal(backup.participations.at(-1).key, participations.at(-1).key);
  assert.equal(tenders[0].bidName, 'Gói thầu 0', 'backup creation must not mutate source records');
  assert.ok(
    Buffer.byteLength(JSON.stringify(backup), 'utf8') < 30_000_000,
    'a representative payload at both record caps must remain importable'
  );
});

test('backup helpers preserve terminal states and terminalize active runs according to retained data', () => {
  for (const status of ['SUCCESS', 'PARTIAL', 'ERROR', 'CANCELLED', 'TIMEOUT']) {
    const safe = safeRunForBackup({ id: status, status, queue: [{ token: SENTINEL }] });
    assert.equal(safe.status, status);
    assert.equal('queue' in safe, false);
  }

  const retained = safeRunForBackup({
    id: 'running-with-data', status: 'RUNNING', captured: 12, queue: [{ token: SENTINEL }]
  }, { terminalize: true });
  assert.equal(retained.status, 'PARTIAL');
  assert.equal(retained.partial, true);
  assert.equal(retained.captured, 12);
  assert.match(retained.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal('queue' in retained, false);

  const empty = safeRunForBackup({
    id: 'starting-empty', status: 'STARTING', captured: 0
  }, { terminalize: true });
  assert.equal(empty.status, 'CANCELLED');
  assert.equal(empty.partial, false);
  assert.match(empty.finishedAt, /^\d{4}-\d{2}-\d{2}T/);

  const projected = buildSafeBackupState({
    settings: DEFAULT_SETTINGS,
    tenders: [],
    participations: [],
    runs: [
      { id: 'scan-with-data', status: 'SCANNING', captured: 2 },
      { id: 'listing-empty', status: 'LISTING', captured: 0 }
    ]
  }, {}, DEFAULT_SETTINGS);
  assert.deepEqual(projected.runs.map((run) => run.status), ['PARTIAL', 'CANCELLED']);

  const radar = buildSafeBackupState({
    settings: DEFAULT_SETTINGS,
    tenders: [{
      key: 'IB-radar::00', notifyNo: 'IB-radar', bidName: 'Gói Radar',
      changeLog: Array.from({ length: 7 }, (_, i) => ({
        field: 'price', label: 'Giá', before: i, after: i + 1,
        at: `2026-09-0${i + 1}T00:00:00.000Z`
      }))
    }],
    participations: [], runs: []
  }, {}, DEFAULT_SETTINGS);
  assert.deepEqual(radar.tenders[0].changeLog.map((item) => item.before), ['2', '3', '4', '5', '6']);
});

test('malformed JSON template bodies are omitted instead of exported unsanitized', () => {
  assert.equal(safeTemplateForBackup({ body: '{not valid JSON' }), null);
});
