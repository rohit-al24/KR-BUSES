import React from 'react';
import { Bus } from 'lucide-react';

const Splash: React.FC = () => {
	return (
		<div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary to-secondary">
			<div className="text-center">
				<div className="mx-auto w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mb-4">
					<Bus className="w-10 h-10 text-white" />
				</div>
				<h1 className="text-4xl font-bold text-white">BusMate</h1>
						<p className="mt-2 text-sm text-white/80">Your campus ride, organized.</p>
						<div className="mt-6 flex items-center justify-center">
							<div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
						</div>
			</div>
		</div>
	);
};

export default Splash;
