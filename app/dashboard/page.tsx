export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import styles from "./page.module.css";
import DashboardLiveStats from "./DashboardLiveStats";
import ActiveVisitsModule from "./ActiveVisitsModule";

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    return (
        <div className="animate-slide-up">
            <div className={styles.welcomeSection}>
                <h2 className={styles.greeting}>Welcome back, {session?.user?.name?.split(" ")[0] || "Staff"}!</h2>
                <p className={styles.date}>{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            </div>

            <DashboardLiveStats />

            <div className={styles.widgetsGrid}>
                <ActiveVisitsModule />
            </div>
        </div>
    );
}
