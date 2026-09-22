import test from "node:test";
import assert from "node:assert/strict";
import { classifySyncError, isNetworkFailure } from "../src/lib/syncError.js";

test("network failures do not consume retry attempts",()=>{
  assert.deepEqual(classifySyncError(new Error("Failed to fetch")), {code:"NETWORK_ERROR",retryable:true,consumesAttempt:false});
  assert.equal(isNetworkFailure(new Error("offline")),true);
});
test("permanent database errors fail immediately",()=>{
  for(const code of ["23502","22P02","23514","42883","42P01","42703"]){
    const r=classifySyncError({code,message:"database error"});
    assert.equal(r.retryable,false,code);
    assert.equal(r.consumesAttempt,true,code);
    assert.equal(r.code,"VALIDATION_ERROR",code);
  }
  assert.deepEqual(classifySyncError({code:"42501",message:"new row violates row-level security policy"}),{code:"PERMISSION_ERROR",retryable:false,consumesAttempt:true});
  assert.deepEqual(classifySyncError({code:"23505",message:"violates unique constraint"}),{code:"UNIQUE_CONSTRAINT",retryable:false,consumesAttempt:true});
});
test("transient errors remain retryable",()=>{
  assert.deepEqual(classifySyncError({code:"PGRST204",message:"column missing from schema cache"}),{code:"SCHEMA_ERROR",retryable:true,consumesAttempt:true});
  assert.deepEqual(classifySyncError({code:"57014",message:"statement timeout"}),{code:"TIMEOUT",retryable:true,consumesAttempt:true});
  assert.deepEqual(classifySyncError({code:"PGRST301",message:"JWT expired"}),{code:"AUTH_EXPIRED",retryable:true,consumesAttempt:true});
  assert.deepEqual(classifySyncError({message:"429 too many requests"}),{code:"RATE_LIMITED",retryable:true,consumesAttempt:true});
});
test("unknown server errors default to retryable",()=>{
  assert.deepEqual(classifySyncError({code:"500",message:"server exploded"}),{code:"SERVER_ERROR",retryable:true,consumesAttempt:true});
});
test("array conflicts keep their own code so the UI can explain them",()=>{
  assert.deepEqual(classifySyncError({code:"PWR_ARRAY_CONFLICT",message:"changed on another device"}),{code:"PWR_ARRAY_CONFLICT",retryable:false,consumesAttempt:true});
});
