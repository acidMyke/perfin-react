import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/expenses/agent/create')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/expenses/agent/create"!</div>
}
