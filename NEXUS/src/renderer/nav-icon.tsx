export function NavIcon({id}:{id:string}){
  const paths:Record<string,string>={today:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',health:'M12 3v18M3 12h18',finance:'M4 20v-4h3v4M10 20V9h3v11M16 20V4h3v16',work:'M3 8h18v13H3zM8 8V4h8v4',journal:'M5 3h14v18H5zM8 7h8M8 11h8M8 15h8',settings:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'};
  return <svg className="nexus-nav-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={paths[id]??paths.settings}/></svg>;
}
