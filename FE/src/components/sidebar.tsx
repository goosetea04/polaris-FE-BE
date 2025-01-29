"use client"
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { User } from "@supabase/supabase-js";

interface SidebarProps {
    setDestinationCoords: (coords: [number, number] | null) => void;
    user: User | null;
}

export default function Sidebar({ setDestinationCoords, user }: SidebarProps) {
    const router = useRouter();
    const supabase = createClientComponentClient();
    const [location, setLocation] = useState("");
    const [results, setResults] = useState<{ display_name: string; coords: [number, number] }[]>([]);
    const [error, setError] = useState("");

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/auth/signin");
    };

    const handleSignIn = () => {
        router.push("/auth/signin");
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocation(e.target.value);
    };

    const handleNavigate = async () => {
        setError("");
        if (location.trim()) {
            const url = `https://nominatim.openstreetmap.org/search?q=${location}&format=json&limit=5`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.length > 0) {
                    setResults(
                        data.map((item: any) => ({
                            display_name: item.display_name,
                            coords: [parseFloat(item.lon), parseFloat(item.lat)] as [number, number],
                        }))
                    );
                } else {
                    setError("No locations found. Please refine your search.");
                }
            } catch {
                setError("Error finding location. Try again.");
            }
        } else {
            setError("Please enter a destination.");
        }
    };

    return (
        <div className="flex flex-col h-screen w-[350px] bg-slate-50 shadow-lg rounded-l-2xl overflow-hidden border border-slate-200">
            {/* Header - Softer gradient */}
            <div className="px-6 py-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-white">
                {user ? (
                    <div className="space-y-2">
                        <p className="text-lg font-semibold">{user.user_metadata.display_name}</p>
                        <p className="text-sm text-teal-50">Red Crescent Worker</p>
                        <button 
                            onClick={handleSignOut} 
                            className="mt-2 w-full py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
                        >
                            Sign Out
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-lg font-semibold">Welcome, Guest</p>
                        <button 
                            onClick={handleSignIn} 
                            className="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
                        >
                            Sign In
                        </button>
                    </div>
                )}
            </div>

            {/* Status Message - Softer yellow */}
            <div className="px-4 py-3 text-sm text-amber-800 bg-amber-50 border-y border-amber-100 font-medium">
                No disasters in your immediate area
            </div>

            {/* Scrollable content container */}
            <div className="flex-1 overflow-y-auto">
                {/* Location Search */}
                <div className="p-4 bg-white border-b border-slate-100 text-black">
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            placeholder="Enter Location"
                            value={location}
                            onChange={handleInputChange}
                            className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        />
                        <button 
                            onClick={handleNavigate} 
                            className="p-2.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors duration-200"
                        >
                            Go
                        </button>
                    </div>
                    {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
                    {results.length > 0 && (
                        <ul className="mt-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
                            {results.map((result, index) => (
                                <li
                                    key={index}
                                    className="p-2 hover:bg-slate-100 cursor-pointer rounded-md text-sm transition-colors duration-150"
                                    onClick={() => setDestinationCoords(result.coords)}
                                >
                                    {result.display_name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Organizations */}
                <div className="p-4 bg-white border-b border-slate-100">
                    <h2 className="text-base font-semibold text-slate-800">Organizations Operating Here:</h2>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                        <li className="flex items-center">
                            <span className="text-emerald-500 mr-2">✓</span>
                            Red Crescent
                        </li>
                        <li className="flex items-center">
                            <span className="text-emerald-500 mr-2">✓</span>
                            UNHCR
                        </li>
                    </ul>
                </div>

                {/* AI Suggestions */}
                <div className="p-4 bg-white">
                    <h2 className="text-base font-semibold text-slate-800">AI Assistant Suggestions:</h2>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                        <li className="flex items-start">
                            <span className="text-amber-500 mr-2">⚠️</span>
                            <span>Stay inside during sandstorms, avoid windows.</span>
                        </li>
                        <li className="flex items-start">
                            <span className="text-blue-500 mr-2">📍</span>
                            <span>Check Msheireb; many people are gathered there.</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}