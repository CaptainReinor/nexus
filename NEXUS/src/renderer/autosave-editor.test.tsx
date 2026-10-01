import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAutoSave, useAutosavedEditor } from './autosave';

afterEach(()=>cleanup());

it('autosaves an existing card in StrictMode without saving its initial value',async()=>{
  const persist=vi.fn().mockResolvedValue(undefined);
  function Editor(){
    const [card,setCard]=useState({id:7,name:'Было'});
    const {queue,status}=useAutoSave();
    useAutosavedEditor(card,queue,'card',persist,10);
    return <><input aria-label="Название" value={card.name} onChange={e=>setCard({...card,name:e.target.value})}/><span>{status.state}</span></>;
  }
  render(<React.StrictMode><Editor/></React.StrictMode>);
  expect(persist).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox',{name:'Название'}),{target:{value:'Стало'}});
  await waitFor(()=>expect(persist).toHaveBeenCalledWith({id:7,name:'Стало'}));
  await waitFor(()=>expect(screen.getByText('saved')).toBeTruthy());
});
