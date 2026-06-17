import dotenv from 'dotenv';
import mongoose from 'mongoose';

import connectDB from './db.js';
import Category from './models/Category.js';
import Column from './models/Column.js';
import CssClass from './models/CssClass.js';
import Format from './models/Format.js';
import Project from './models/Project.js';

dotenv.config();

const formatSeeds = [
  { dataType: 'Date', value: 'yyyy/MM/dd', description: '年/月/日', order: 1 },
  { dataType: 'Date', value: 'yyyy年MM月dd日', description: '年月日（漢字）', order: 2 },
  { dataType: 'Date', value: 'MM/dd/yyyy', description: '月/日/年（米国）', order: 3 },
  { dataType: 'Date', value: 'yyyy-MM-dd', description: '年-月-日（ISO）', order: 4 },
  { dataType: 'Number', value: 'n0', description: '整数', order: 5 },
  { dataType: 'Number', value: 'n2', description: '小数2桁', order: 6 },
  { dataType: 'Number', value: '#,##0', description: '3桁カンマ区切り', order: 7 },
  { dataType: 'Number', value: '#,##0.00', description: '3桁カンマ区切り・小数2桁', order: 8 },
];

const cssClassSeeds = [
  { value: 'cell-left', description: '左寄せ', order: 1 },
  { value: 'cell-center', description: '中央寄せ', order: 2 },
  { value: 'cell-right', description: '右寄せ', order: 3 },
  { value: 'cell-required', description: '必須マーク', order: 4 },
  { value: 'cell-highlight', description: 'ハイライト', order: 5 },
];

const seed = async() => {
  await connectDB();
  console.log('Seeding master data...');

  await Format.deleteMany({});
  await Format.insertMany(formatSeeds);
  console.log(`Inserted ${formatSeeds.length} Format records`);

  await CssClass.deleteMany({});
  await CssClass.insertMany(cssClassSeeds);
  console.log(`Inserted ${cssClassSeeds.length} CssClass records`);

  // サンプルプロジェクトの冪等削除
  const existing = await Project.findOne({ name: '売上レポート（サンプル）' });
  if (existing) {
    await Column.deleteMany({ projectId: existing._id });
    await Category.deleteMany({ projectId: existing._id });
    await Project.deleteOne({ _id: existing._id });
  }

  // マスタ ID 解決
  const formats = await Format.find({});
  const cssClasses = await CssClass.find({});
  const fmtId = (val) => {
    const fmt = formats.find(f => f.value === val);
    if (!fmt) { throw new Error(`Format not found: ${val}`); }
    return fmt._id;
  };
  const cssId = (val) => {
    const css = cssClasses.find(c => c.value === val);
    if (!css) { throw new Error(`CssClass not found: ${val}`); }
    return css._id;
  };

  // Project 作成
  const project = await Project.create({
    name: '売上レポート（サンプル）',
    description: 'デモ用サンプルプロジェクト',
  });

  // Category 作成
  const [cat1, cat2, cat3] = await Category.insertMany([
    { projectId: project._id, name: '取引情報', order: 1 },
    { projectId: project._id, name: '金額情報', order: 2 },
    { projectId: project._id, name: 'ステータス', order: 3 },
  ]);

  // Column 作成
  await Column.insertMany([
    {
      projectId: project._id, categoryId: cat1._id,
      key: 'transactionId', label: '取引ID', dataType: 'string',
      cssClassIds: [cssId('cell-center')], required: true, order: 1,
    },
    {
      projectId: project._id, categoryId: cat1._id,
      key: 'customerName', label: '顧客名', dataType: 'string',
      cssClassIds: [cssId('cell-left')], required: true, order: 2,
    },
    {
      projectId: project._id, categoryId: cat1._id,
      key: 'transactionDate', label: '取引日', dataType: 'date',
      formatId: fmtId('yyyy/MM/dd'), cssClassIds: [cssId('cell-center')], order: 3,
    },
    {
      projectId: project._id, categoryId: cat2._id,
      key: 'unitPrice', label: '単価', dataType: 'number',
      formatId: fmtId('#,##0'), cssClassIds: [cssId('cell-right')], order: 1,
    },
    {
      projectId: project._id, categoryId: cat2._id,
      key: 'quantity', label: '数量', dataType: 'number',
      formatId: fmtId('n0'), cssClassIds: [cssId('cell-right')], order: 2,
    },
    {
      projectId: project._id, categoryId: cat2._id,
      key: 'totalAmount', label: '合計金額', dataType: 'number',
      formatId: fmtId('#,##0'), cssClassIds: [cssId('cell-right'), cssId('cell-highlight')], order: 3,
    },
    {
      projectId: project._id, categoryId: cat3._id,
      key: 'isPaid', label: '支払済', dataType: 'boolean',
      cssClassIds: [cssId('cell-center')], order: 1,
    },
    {
      projectId: project._id, categoryId: cat3._id,
      key: 'notes', label: '備考', dataType: 'string',
      cssClassIds: [cssId('cell-left')], order: 2,
    },
  ]);
  console.log(`Inserted sample project: ${project.name} (3 categories, 8 columns)`);

  console.log('Seed completed');
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
