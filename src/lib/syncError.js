// PowerMate sync error classification — deliberately dependency-free so it can be
// unit-tested in Node without importing the browser/Supabase client.
const RETRYABLE_CODES=new Set([
  "57014", "08000","08003","08006","08001","08004", "PGRST301",
]);
const PERMANENT_CODES=new Set([
  "23502", "22P02", "23514", "42501", "42883","42P01","42703",
]);

export function isNetworkFailure(error){
  if(error?.code)return false;
  const msg=String(error?.message||"").toLowerCase();
  return !msg||/fetch|network|timeout|offline|connection/.test(msg);
}

export function classifySyncError(error){
  if(isNetworkFailure(error))return{code:"NETWORK_ERROR",retryable:true,consumesAttempt:false};
  const pgCode=error?.code;
  if(pgCode==="PGRST204")return{code:"SCHEMA_ERROR",retryable:true,consumesAttempt:true};
  if(pgCode==="23505")return{code:"UNIQUE_CONSTRAINT",retryable:false,consumesAttempt:true};
  if(pgCode==="23503")return{code:"FOREIGN_KEY_ERROR",retryable:true,consumesAttempt:true};
  if(pgCode&&RETRYABLE_CODES.has(pgCode))return{code:pgCode==="PGRST301"?"AUTH_EXPIRED":"TIMEOUT",retryable:true,consumesAttempt:true};
  if(pgCode&&PERMANENT_CODES.has(pgCode))return{code:pgCode==="42501"?"PERMISSION_ERROR":"VALIDATION_ERROR",retryable:false,consumesAttempt:true};
  const msg=String(error?.message||"").toLowerCase();
  if(/rate limit|too many requests|429/.test(msg))return{code:"RATE_LIMITED",retryable:true,consumesAttempt:true};
  if(/jwt|token/.test(msg)&&/expired|invalid/.test(msg))return{code:"AUTH_EXPIRED",retryable:true,consumesAttempt:true};
  return{code:"SERVER_ERROR",retryable:true,consumesAttempt:true};
}
