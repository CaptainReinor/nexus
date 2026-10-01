import type { ComponentType } from 'react';
import { DashboardPage } from './modules/dashboard';
import { HealthPage } from './modules/health';
import { FinancePage } from './modules/finance';
import { WorkPage } from './modules/work';
import { SettingsPage } from './modules/settings';

export type ModuleDefinition={id:string;path:string;label:string;glyph:string;component:ComponentType};
export const moduleRegistry:ModuleDefinition[]=[
  {id:'today',path:'/',label:'Сегодня',glyph:'◈',component:DashboardPage},
  {id:'health',path:'/health',label:'Здоровье',glyph:'✚',component:HealthPage},
  {id:'finance',path:'/finance',label:'Финансы',glyph:'▣',component:FinancePage},
  {id:'work',path:'/work',label:'Работа',glyph:'▤',component:WorkPage},
  {id:'settings',path:'/settings',label:'Настройки',glyph:'⚙',component:SettingsPage}
];
