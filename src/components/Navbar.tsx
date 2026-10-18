import { Suspense } from "react";
import NavbarClient from "./NavbarClient";
import { getSessionUser } from "@/lib/auth/session";

async function NavbarWithSession() {
  const user = await getSessionUser();
  return <NavbarClient user={user ? { name: user.name, email: user.email } : null} />;
}

export default function Navbar() {
  return (
    <Suspense fallback={<NavbarClient user={null} />}>
      <NavbarWithSession />
    </Suspense>
  );
}
