import { createRoot } from "react-dom/client";
import React, { useEffect, useState } from "react";
import App from "./App.tsx";
import LoadingSplash from "./components/LoadingSplash";
import "./index.css";

const Root = () => {
	const [showSplash, setShowSplash] = useState(true);
	useEffect(() => {
		const t = setTimeout(() => setShowSplash(false), 2000);
		return () => clearTimeout(t);
	}, []);

	if (showSplash) return <LoadingSplash />;
	return <App />;
};

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error('Root element not found');
createRoot(rootEl).render(<Root />);
