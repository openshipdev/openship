import { Suspense } from "react";
import { SiteHeader, SiteFooter } from "../../components/site-shell";
import Profile from "../../components/profile";
export const metadata = { title: "Profile" };
async function ProfileContent({ searchParams }) {
  const params = await searchParams;
  return (
    <Profile
      loginError={Boolean(params.error)}
      integrationError={Boolean(params.integrationError)}
    />
  );
}

export default function ProfilePage({ searchParams }) {
  return (
    <>
      <SiteHeader />
      <main className="directory-shell profile-shell">
        <header>
          <h1>Your profile.</h1>
          <p>Your account and Vercel projects.</p>
        </header>
        <Suspense fallback={<p role="status">Loading your profile…</p>}>
          <ProfileContent searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
