import fs from "node:fs";
import http from "node:http";
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

const fixture = `
const params = new URLSearchParams(location.search);
const count = params.get('empty') === '1' ? 0 : 50;
const itemId = '1c884ffe-af17-42fc-8547-bebfbc6cfba0';
const item = {id:itemId,name:params.has('long')?'Hair dryer operasional '.repeat(12):'Hair dryer',isActive:true,description:params.has('long')?'Deskripsi fixture untuk memeriksa scroll dan akses footer. '.repeat(25):'Peralatan kamar tamu.',photoUrl:null};
const units = Array.from({length:count},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),itemId,unitNumber:i+1,unitCode:'HK-'+String(i+1).padStart(6,'0'),serialNumber:i===0?'Doraemon-EP1':'SERIAL-'+(i+1),notes:null,lifecycle:'ACTIVE',custody:'HOUSEKEEPING',condition:'GOOD',readiness:'CLEAR',lossState:'NONE',location:{id:'storage',name:'Gudang Housekeeping'},createdAt:new Date('2026-10-23T03:00:00Z'),updatedAt:new Date('2026-10-23T03:00:00Z')}));
export async function listItemDeactivationRequests(){return{deactivationRequests:[],pagination:{page:1,pageSize:10,total:0,totalPages:0,hasNextPage:false}}};
export async function requireActiveUser(){return{id:'operator',name:'UI fixture',isActive:true,roles:[params.has('readonly')?'MANAGEMENT':'HK_STAFF']}};
export async function listItems(){return{items:[{...item,createdAt:new Date(),updatedAt:new Date()}],pagination:{page:1,pageSize:20,total:1,totalPages:1,hasNextPage:false}}};
export async function getItemUnits(){return{item,units,totalRegistered:count?70:0,nextCursor:count?50:null}};
export async function getStockLocations(){return[{id:'69c4960b-a275-4c67-a384-57331403c677',name:'Gudang Housekeeping'}]};
`;
const bundle = await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import InventoryPage from './src/app/(workspace)/inventory/page';import DeactivationPage from './src/app/(workspace)/inventory/deactivation-requests/page';const requests=new URLSearchParams(location.search).has('requests');const tree=await (requests?DeactivationPage:InventoryPage)({searchParams:Promise.resolve(requests?Object.fromEntries(new URLSearchParams(location.search)):{item:'1c884ffe-af17-42fc-8547-bebfbc6cfba0'})});createRoot(document.getElementById('root')).render(tree);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "isolated-ui-fixture", setup(builder) {
    builder.onResolve({ filter: /^@\/server\/(require-active-user|list-items|item-units|stock-locations|list-item-deactivation)$/ }, () => ({ path: "data", namespace: "fixture" }));
    builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
      if (args.path === "data") return { contents: fixture };
      if (args.path === "empty") return { contents: "export {}" };
      if (args.path === "next/navigation") return { contents: "const router={refresh(){},replace(){},back(){}};export const useRouter=()=>router;export const usePathname=()=>'/inventory';export function redirect(path){throw new Error('Unexpected fixture redirect: '+path)}" };
      if (args.path === "next/link") return { resolveDir: process.cwd(), contents: "import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,scroll,onNavigate,...props}){return React.createElement('a',props,children)}" };
      return { resolveDir: process.cwd(), contents: "import React from 'react';export default function Image({fill,unoptimized,priority,...props}){return React.createElement('img',props)}" };
    });
  } }],
});
const compiler = await compile(fs.readFileSync("src/app/globals.css", "utf8"), { base: `${process.cwd()}/src/app`, onDependency() {} });
const scanner = new Scanner({ sources: [{ base: process.cwd(), pattern: "src/**/*.{tsx,css}", negated: false }] });
const css = compiler.build(scanner.scan());
const html = `<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><p style="padding:8px;font:12px Arial">Isolated UI fixture — no live data</p><div id="root"></div><script type="module">${bundle.outputFiles[0].text}</script></body></html>`;
const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/item-units/")) {
    const id = request.url.split("/")[3];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ unit: { id, unitCode: "HK-" + id.slice(-6) }, events: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0, hasNextPage: false } }));
    return;
  }
  if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
  response.writeHead(200, { "Content-Type": "text/html" }); response.end(html);
});
server.listen(4319, "127.0.0.1", () => console.log("Isolated actual-source UI fixture ready: http://127.0.0.1:4319"));
