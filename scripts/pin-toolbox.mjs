import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
export function pinSources(cargo,adapter,revision){
 if(!/^[a-f0-9]{40}$/i.test(revision||''))throw new Error('Provide a full 40-character reviewed Toolbox commit SHA.');
 const dependency=/linutil_core\s*=\s*\{[^\n]*git\s*=\s*"https:\/\/github\.com\/Commanderx-code\/commander-toolbox\.git"[^\n]*rev\s*=\s*"([a-f0-9]{40})"/;
 const constant=/pub const REVISION: &str = "([a-f0-9]{40})";/;
 const match=cargo.match(dependency),reported=adapter.match(constant);
 if(!match||!reported||match[1]!==reported[1])throw new Error('Existing Toolbox pins are missing or inconsistent.');
 return {cargo:cargo.replace(dependency,full=>full.replace(match[1],revision.toLowerCase())),adapter:adapter.replace(constant,`pub const REVISION: &str = "${revision.toLowerCase()}";`)};
}
export function main(){
 const revision=process.argv[2];
 if(process.argv.length!==3||!/^[a-f0-9]{40}$/i.test(revision||''))throw new Error('Usage: npm run toolbox:pin -- REVIEWED_COMMIT_SHA');
 const root=fileURLToPath(new URL('../',import.meta.url));
 const paths=['src-tauri/Cargo.toml','src-tauri/src/toolbox.rs','src-tauri/Cargo.lock'];
 const run=(program,args,stdio='pipe',cwd=root)=>{
  const result=spawnSync(program,args,{cwd,encoding:'utf8',stdio,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  if(result.status!==0)throw new Error(result.stderr||`${program} ${args.join(' ')} failed`);
  return result.stdout?.trim()||'';
 };
 if(run('git',['status','--porcelain','--',...paths]))throw new Error('Commit or stash your Cargo/toolbox changes first so rollback can preserve them.');
 const originals=paths.map(path=>readFileSync(join(root,path)));
 const next=pinSources(originals[0].toString(),originals[1].toString(),revision);
 if(next.cargo===originals[0].toString()){console.log('Already pinned to this revision.');return;}
 const temp=mkdtempSync(join(tmpdir(),'command-center-toolbox-'));let changed=false;
 try{
  run('git',['init','-q',temp]);
  run('git',['fetch','--depth=1','https://github.com/Commanderx-code/commander-toolbox.git',revision],'inherit',temp);
  if(run('git',['rev-parse','FETCH_HEAD'],'pipe',temp).toLowerCase()!==revision.toLowerCase())throw new Error('Fetched revision does not match the reviewed commit.');
  changed=true;writeFileSync(join(root,paths[0]),next.cargo);writeFileSync(join(root,paths[1]),next.adapter);
  run('cargo',['update','--manifest-path','src-tauri/Cargo.toml','-p','linutil_core'],'inherit');
  for(const command of ['check','test','test:rust'])run('npm',['run',command],'inherit');
  console.log('Catalog pin and lockfile updated and tested. Review the git diff, then close the app and run npm run desktop:install. Restart afterward.');
 }catch(error){
  if(changed){paths.forEach((path,i)=>writeFileSync(join(root,path),originals[i]));console.error('Validation failed; original pins and Cargo.lock restored.');}
  throw error;
 }finally{rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
