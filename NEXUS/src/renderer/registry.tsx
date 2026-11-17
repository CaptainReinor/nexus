// Shared by the desktop and Android shells; optional modules load on demand.
export const primaryNavigation=[
  {id:'day',label:'День',icon:'day'},
  {id:'progress',label:'Прогресс',icon:'progress'},
  {id:'friends',label:'Друзья',icon:'friends'}
] as const;
export type PrimaryScreen=typeof primaryNavigation[number]['id'];
