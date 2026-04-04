import { Card } from "@tremor/react";

export default function DealFeed() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100 mb-6">Deal Feed</h1>
      <Card className="bg-gray-900 border-gray-800">
        <p className="text-gray-400 text-sm">
          Deal feed table will appear here. Filters: type, sector, geo, amount.
        </p>
      </Card>
    </div>
  );
}
