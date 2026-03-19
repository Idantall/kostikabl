import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function UploadFont() {
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    
    setUploading(true);
    setMsg(null);
    
    // Detect if Bold or Regular based on filename
    const isBold = file.name.toLowerCase().includes('bold');
    const targetPath = isBold 
      ? 'fonts/NotoSansHebrew-Bold.ttf' 
      : 'fonts/NotoSansHebrew-Regular.ttf';
    
    const { error } = await supabase
      .storage
      .from('assets')
      .upload(targetPath, file, { 
        upsert: true, 
        contentType: 'font/ttf' 
      });
    
    setMsg(error ? error.message : `✅ הועלה בהצלחה ל assets/${targetPath}`);
    setUploading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="p-6 max-w-md w-full">
        <form onSubmit={upload} dir="rtl">
          <h2 className="text-xl font-bold mb-4">העלאת פונט עברית</h2>
          <p className="text-sm text-muted-foreground mb-4">
            העלה NotoSansHebrew-Regular.ttf או NotoSansHebrew-Bold.ttf
            <br />
            הקובץ יזוהה אוטומטית לפי השם
          </p>
          <div className="space-y-4">
            <input 
              type="file" 
              accept=".ttf,.otf" 
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full"
            />
            {file && (
              <div className="text-sm">
                סוג: {file.name.toLowerCase().includes('bold') ? 'Bold' : 'Regular'}
              </div>
            )}
            <Button type="submit" disabled={!file || uploading} className="w-full">
              {uploading ? 'מעלה...' : 'העלה פונט'}
            </Button>
            {msg && <div className="mt-3 text-sm">{msg}</div>}
          </div>
        </form>
      </Card>
    </div>
  );
}
