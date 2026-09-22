import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
    return (
        <div className="bg-white p-8 text-black">
            <h1 className="text-md font-bold">teste inicial.</h1>
            <p className="mt-4 text-lg">
                Edit <code>src/routes/index.tsx</code> to get started.
            </p>
        </div>
    );
}
