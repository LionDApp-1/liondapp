"use strict";
const setupMode = new URLSearchParams(location.search).get("setup") === "1";
const el = id => document.getElementById(id);
const form = el("login-form");
const messages = {
 admin_login_failed: "账号或密码不正确。 / Incorrect username or password.",
 admin_login_rate_limited: "尝试次数过多，请稍后再试。 / Too many attempts. Try again later.",
 admin_password_length: "密码需要 14–128 位。 / Use 14–128 characters.",
 admin_username_invalid: "账号需 3–64 位字母、数字或 . _ -。 / Use 3–64 letters, numbers or . _ -.",
 admin_authentication_required: "请通过原管理员验证。 / Verify the original administrator first.",
};
async function auth(path, body) {
 const response = await fetch("/api/admin/auth/" + path, body ? {method:"POST",headers:{"content-type":"application/json","x-liondapp-admin":"1"},body:JSON.stringify(body)} : {});
 const type=response.headers.get("content-type") || "";
 if(!type.includes("application/json")) throw new Error("登录验证已过期，请重新打开页面。 / Verification expired. Reopen this page.");
 const result=await response.json();
 if(!response.ok) throw new Error(messages[result.error] || "操作失败，请重试。 / Request failed. Try again.");
 return result;
}
if(setupMode) {
 el("login-title").textContent="设置管理员账号 / Set administrator credentials";
 el("login-submit").textContent="保存账号密码 / Save credentials";
 el("password").autocomplete="new-password"; el("password").minLength=14;
 el("confirmation").required=true; el("confirm-row").hidden=false;
 el("setup-note").hidden=false; el("remember-row").hidden=true;
}
form.hidden=true;
auth("status").then(status=>{
 if(setupMode && !status.accessVerified) {el("setup-blocked").hidden=false;return;}
 if(!setupMode && status.authenticated) {location.replace("/");return;}
 if(!setupMode && !status.configured) {el("setup-blocked").hidden=false;return;}
 form.hidden=false;
}).catch(error=>{el("login-error").textContent=error.message; form.hidden=false;});
form.addEventListener("submit",async event=>{
 event.preventDefault(); el("login-error").textContent="";
 if(setupMode && el("password").value!==el("confirmation").value) {el("login-error").textContent="两次密码不一致 / Passwords do not match";return;}
 el("login-submit").disabled=true;
 try {
  const result=await auth(setupMode?"setup":"login",{username:el("username").value,password:el("password").value,remember:el("remember").checked});
  el("password").value="";el("confirmation").value="";
  if(setupMode){location.replace(result.consoleUrl+"/login.html");}else{location.replace("/");}
 }catch(error){el("login-error").textContent=error.message;}finally{el("login-submit").disabled=false;}
});
