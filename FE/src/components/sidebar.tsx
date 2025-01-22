// components/sidebar.tsx
"use client"
import React, { useState } from "react";
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User } from '@supabase/supabase-js';

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
        router.push('/auth/signin');
    };

    const handleSignIn = () => {
        router.push('/auth/signin');
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocation(e.target.value);
    };

    const geocodeLocation = async (address: string) => {
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${address}&format=json&limit=5`;
            const response = await fetch(url);
            const data = await response.json();

            if (data && data.length > 0) {
                const formattedResults = data.map((item: any) => ({
                    display_name: item.display_name,
                    coords: [parseFloat(item.lon), parseFloat(item.lat)] as [number, number],
                }));
                return formattedResults;
            } else {
                throw new Error("Location not found");
            }
        } catch (error) {
            console.error("Geocoding error:", error);
            alert("Error finding location. Please try again.");
            return [];
        }
    };

    const handleNavigate = async () => {
        console.log(user)
        setError("");
        if (location.trim()) {
            const coordsList = await geocodeLocation(location);
            if (coordsList.length > 0) {
                setResults(coordsList);
            } else {
                setError("No locations found for your search. Please refine your query.");
            }
        } else {
            setError("Please enter a destination.");
        }
    };

    const handleSelectLocation = (coords: [number, number]) => {
        setDestinationCoords(coords);
        setResults([]);
        setLocation("");
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleNavigate();
        }
    };

    return (
        <div className="flex flex-col h-full w-[350px] max-w-full bg-white shadow-lg rounded-l-xl overflow-hidden">
            {/* Header */}
            <div className="h-[20%] px-4 py-6 bg-green-200 text-black text-lg font-semibold text-center">
                {user ? (
                    <>
                        <div>Good Morning, {user.user_metadata.display_name}</div>
                        <div className="mt-2 text-sm">Red Crescent Worker</div>
                        <button
                            onClick={handleSignOut}
                            className="mt-4 w-full py-2 bg-red-300 text-white font-medium rounded-lg hover:bg-red-400 transition-colors"
                        >
                            Sign Out
                        </button>
                    </>
                ) : (
                    <>
                        <div>Welcome, Guest</div>
                        <button
                            onClick={handleSignIn}
                            className="mt-4 w-full py-2 bg-green-300 text-white font-medium rounded-lg hover:bg-green-400 transition-colors"
                        >
                            Sign In
                        </button>
                    </>
                )}
            </div>

            {/* Status Message */}
            <div className="h-[10%] text-black px-4 py-4 text-center text-sm bg-yellow-200">
                <p>There are currently no disasters in your immediate area</p>
            </div>

            {/* Location Search */}
            <div className="h-[25%] w-full px-4 py-6 z-50 bg-green-100 text-black">
                <div className="flex flex-row items-center space-x-2 w-full text-black">
                    <input
                        type="text"
                        placeholder="Enter Location"
                        value={location}
                        onChange={handleInputChange}
                        onKeyPress={handleKeyPress}
                        className="flex-1 w-4 p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                    />
                    <button
                        onClick={handleNavigate}
                        className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                        Navigate
                    </button>
                </div>
                {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}
                {results.length > 0 && (
                    <div className="text-black mt-4 p-2 bg-gray-100 border rounded-lg">
                        <p className="font-medium text-sm mb-2">Select a location:</p>
                        <ol className="space-y-2">
                            {results.map((result, index) => (
                                <li
                                    key={index}
                                    className="p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-200"
                                    onClick={() => handleSelectLocation(result.coords)}
                                >
                                    {result.display_name}
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </div>

            {/* Organizations */}
            <div className="h-[20%] px-4 py-6 bg-green-100 text-black">
                <h2 className="text-lg font-semibold">Other Organizations Operating Here:</h2>
                <ul className="mt-2 space-y-1 text-sm">
                    <li>Red Crescent</li>
                    <li>UNHCR</li>
                </ul>
            </div>

            {/* AI Suggestions */}
            <div className="h-[25%] px-4 py-6 bg-green-100 text-black">
                <h2 className="text-lg font-semibold">AI Assistant Suggestions:</h2>
                <ul className="mt-2 space-y-1 text-sm">
                    <li>For severe sandstorms, stay inside buildings and avoid windows.</li>
                    <li>Check Msheireb, that is where a lot of people are grouped up.</li>
                </ul>
            </div>
        </div>
    );
}
