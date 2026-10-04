import { useEffect,useState } from 'react';
import {useTheme,useNavigationCopy} from './appearance';
import {NavIcon} from './nav-icon';
import {Modal} from './ui';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { moduleRegistry } from './registry';
import { localDay } from '../shared/domain';
import { ConnectionGate } from './connection-gate';
import { ConfirmHost } from './confirm';

export function App(){
  const theme=useTheme(),navCopy=useNavigationCopy(),[navigationOpen,setNavigationOpen]=useState(false);
  const location=useLocation(),currentIndex=Math.max(0,moduleRegistry.findIndex(m=>m.path===location.pathname)),current=moduleRegistry[currentIndex];
  useEffect(()=>{window.scrollTo(0,0);},[location.pathname]);
  const navigation=(compact=false)=><nav aria-label={compact?'Разделы':'Основная навигация'}>{moduleRegistry.map(m=><NavLink key={m.id} to={m.path} end={m.path==='/'} onClick={()=>setNavigationOpen(false)} aria-label={theme==='dominion'?`${navCopy(m.id,m.label)} — ${m.label}`:m.label} className={({isActive})=>`nav-item ${isActive?'active':''}`}><span className="nav-glyph">{theme==='dominion'?<NavIcon id={m.id}/>:m.glyph}</span><span>{navCopy(m.id,m.label)}</span><span className="nav-chevron">›</span></NavLink>)}</nav>;
  return <><ConfirmHost/><ConnectionGate/><div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-emblem">N</div><div><strong>NEXUS</strong></div></div><div className="sidebar-section-label">РАЗДЕЛЫ <span>{String(currentIndex+1).padStart(2,'0')} / {String(moduleRegistry.length).padStart(2,'0')}</span></div>{navigation()}</aside><div className="main-area"><header className="topbar"><button className="compact-navigation button ghost" aria-label="Открыть разделы" onClick={()=>setNavigationOpen(true)}>☰</button><div className="breadcrumb">NEXUS <span>/</span> {navCopy(current.id,current.label).toUpperCase()}</div><div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(`${localDay()}T12:00:00`))}</span></div></header><main className="page"><Routes>{moduleRegistry.map(m=><Route key={m.id} path={m.path} element={<m.component/>}/>)}</Routes></main></div></div>{navigationOpen&&<Modal title="Разделы" onClose={()=>setNavigationOpen(false)}>{navigation(true)}</Modal>}</>
}
