import { createFileRoute,Outlet } from "@tanstack/react-router";
export const Route=createFileRoute("/assistant")({component:AssistantLayout});
function AssistantLayout(){return <Outlet/>}