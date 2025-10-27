import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/verify')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/verify"!</div>
}
