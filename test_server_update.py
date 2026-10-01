import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('nexus_updater',Path(__file__).parent/'deploy/update_server.py')
updater=importlib.util.module_from_spec(spec);spec.loader.exec_module(updater)

class Reply:
    status=200
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self,*args):return b'{"status":"ok","version":"test"}'

class UpdateTest(unittest.TestCase):
    def test_health_accepts_actual_nexus_response(self):
        with patch.object(updater.urllib.request,'urlopen',return_value=Reply()):
            self.assertTrue(updater.healthy())

    def test_invalid_commit_stops_before_download_or_service_changes(self):
        with patch('sys.argv',['update_server.py','--commit','main']),patch.object(updater.urllib.request,'urlopen') as request,patch.object(updater.subprocess,'run') as run:
            with self.assertRaises(SystemExit):updater.main()
            request.assert_not_called();run.assert_not_called()

    def test_failure_restores_both_original_modules_and_restarts_service(self):
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp);(target/'nexus_backup.py').write_text('old-server');(target/'accounts.py').write_text('old-accounts')
            class CodeReply(Reply):
                def read(self,*args):return b'print("new-code")\n'
            with patch.object(updater.urllib.request,'urlopen',return_value=CodeReply()),patch.object(updater.subprocess,'run') as run,patch.object(updater,'healthy',side_effect=[False,True]):
                with self.assertRaisesRegex(RuntimeError,'old source restored'):updater.update(target,'a'*40)
                self.assertEqual((target/'nexus_backup.py').read_text(),'old-server')
                self.assertEqual((target/'accounts.py').read_text(),'old-accounts')
                self.assertEqual(sum(call.args[0][:2]==['systemctl','restart'] for call in run.call_args_list),2)

if __name__=='__main__':unittest.main()
