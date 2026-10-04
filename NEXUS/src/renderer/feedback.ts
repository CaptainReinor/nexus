export type FeedbackAction='check'|'selection';
let implementation:((action:FeedbackAction)=>Promise<void>|void)|undefined;
export function configureFeedback(callback:(action:FeedbackAction)=>Promise<void>|void){implementation=callback;}
export function acceptedFeedback(action:FeedbackAction){try{void Promise.resolve(implementation?.(action)).catch(()=>{});}catch{/* Missing hardware never blocks data entry. */}}
