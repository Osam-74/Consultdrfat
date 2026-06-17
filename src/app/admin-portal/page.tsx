"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPortalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/p-dfta");
  }, [router]);
  return null;
}
